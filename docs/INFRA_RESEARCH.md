# Infrastructure research (2026-10-13, input for M3)

Not a decision, except the worker design below: the stack is chosen with the hosting at the M3 SPEC rewrite. Facts were checked on the web on 2026-10-13 by three independent research passes (providers, architecture, incidents); prices are list prices without VAT and change, so recheck before committing.

## Requirements that filter
- Data and processing in the EU, signed DPA, public sub-processor list.
- Point-in-time recovery, encryption at rest, plain Postgres (exit by `pg_dump`).
- One person runs it: minimal operations, predictable cost before revenue.
- Web app and worker both write; page credits need an atomic reservation and idempotent retries.
- B2B buyers in DE/UK will ask for a SOC 2 report.

## Database
Postgres, managed, Frankfurt. SQLite variants fail on two writers on different hosts (sqlite.org/whentouse.html); Turso offers a DPA only from $416.58/mo (turso.tech/pricing); D1 has no interactive transactions.

| Provider | Cost (Frankfurt) | PITR | SOC 2 report | Notes |
|---|---|---|---|---|
| AWS RDS PostgreSQL | db.t4g.micro + 20 GB ≈ $17/mo; Multi-AZ ≈ $33 | 0–35 d included | free via AWS | vanilla Postgres; restore creates a new instance; traps: automatic Extended Support billing on old majors, public IPv4 charge |
| Neon (Databricks since 05/2025) | Launch always-on 0.25 CU ≈ $23; Scale ≈ $44 | 7 d Launch, 30 d Scale | Scale only | deprecated its Azure regions (incl. Germany West Central) after the acquisition; no spend cap on paid plans; keep scale-to-zero off (2025 outage hit suspended databases only) |
| Supabase | Pro $25 + Small compute $15 − $10 credit + PITR $100 (7 d) ≈ $130; Team for the SOC 2 report ≈ $704 | add-on $100–400 | Team and above | Edge Functions (2 s CPU, 256 MB) cannot run the worker; Auth, RLS on `auth.uid()`, Storage and Vault need separate migration; Storage not in DB backups; 13.5-day multi-region capacity incident 06–07/2026 (restarts and restores failed) |
| Scaleway | ≈ €11/mo | none documented | no | HA standby in the same data centre; storage-node failure froze databases for hours (07/2026) |
| DigitalOcean | $15/mo | 7 d | yes | HA standby moves to Advanced Edition: $60 → $260/mo from 2026-11-30 |

No EU-region data-loss event was found for any provider in 2024–2026. The real risks are regional outages and a control plane that fails when a restore is needed: rehearse a restore once and keep an off-provider dump.

## Proposed AWS stack (Frankfurt)
AWS is already a sub-processor if the model runs on Bedrock EU, so one DPA covers database, storage, queue and compute.
- **Database:** RDS PostgreSQL (Single-AZ at launch, Multi-AZ with paying customers).
- **Files:** S3 (private source PDFs via signed URLs, lifecycle rules for retention) + CloudFront on a separate content domain for hosted pages; CloudFront flat-rate plans (Free 100 GB, Pro $15) remove egress risk.
- **Auth:** a library with its tables in our database (Better Auth); no auth vendor.
- **Worker:** Lambda functions, one per step, orchestrated by one Step Functions Standard state machine per document version (Express is capped at 5 min). Decided with Andrei on 2026-10-13; details below.

### Worker design (decided 2026-10-13)
**Entry.**
- The web app reserves the credits and writes the document version as `queued` in one transaction, then sends an SQS message (batch size 1).
- The `prepare` Lambda consumes it:
  - validates the payload with zod;
  - reads the PDF from S3 and checks it (pages, encryption, text layer);
  - writes the page rows;
  - starts the execution named after the version id. A repeated name does not start a second Standard execution, so `ExecutionAlreadyExists` counts as success.
- A periodic sweep re-sends versions left `queued` (the SQS send is not part of the database transaction).

**State machine** (JSONata):
1. `Map` over the page ids (inline, `MaxConcurrency` set) → `processPage` Lambda per page:
   - one model call, validation, the page's output to S3 and the database, all idempotent on (version, page);
   - `Catch` (`States.ALL`) → a `Pass` state that returns `{ page, ok: false }`, so the other pages continue.
2. `build` Lambda: reads every page result, builds the HTML, report and `report.json`, charges processed pages only, marks failed pages unsupported (not charged), sets the version to `review`.
3. Every `Task` retries Lambda service errors only (`Lambda.ServiceException`, `Lambda.AWSLambdaException`, `Lambda.SdkClientException`, `Lambda.TooManyRequestsException`): 1 s interval, 3 attempts, backoff 2, full jitter. Model throttling is retried inside the Lambda.
4. A state-machine-level `Catch` → `markFailed` Lambda: version `failed`, reservation released, user notified. Needed because a Lambda that times out never reaches its own `catch` block.

**Each Lambda:**
- validates its input with a zod schema shared with the producer step;
- on error, marks its entity failed (the failure write is itself guarded and logged), logs with the entity ids and the stack, then rethrows a short error so Step Functions records it;
- releases resources (database connection, temp files) in `finally`;
- keeps one client per container (database pool, Bedrock, S3), created at module level.

**Ledger of model calls:** one row per call:
- version, page, step;
- model, request id;
- input, output and cached tokens, cost;
- status (`processing` / `completed` / `failed` with the error), start and end time.

This is the measured cost per page for pricing (M3) and the audit trail for the report. A cache keyed by (page image hash, prompt SHA, model) lets a re-run reuse a completed call.

**Logs:** one structured JSON line per event (`level`, `message`, `file`, `step`, `documentId`, `versionId`, `page`, `executionId`, elapsed seconds), queried with CloudWatch Logs Insights. Level from `LOG_LEVEL` (none / error / info / debug), errors always on.

**Packaging and deploy:**
- `processPage` and `build` are container images: Poppler, Chromium for axe and rendering, the AWS Lambda runtime interface client, and the runtime interface emulator for local runs. `prepare` and `markFailed` are plain Node bundles.
- Lambdas run in the VPC.
- IAM is scoped per resource (one bucket, one queue, one state machine, Bedrock invoke on the chosen EU inference profile, the function log groups).
- Secrets live in SSM / Secrets Manager, never in a template.
- Aliases per stage (dev, prod).

**Limits and networking:**
- Only ids pass between states (256 KB payload cap); results live in S3 and the database.
- Lambda reserved concurrency on `processPage` is the global cap that protects RDS connections and Bedrock quotas across documents; Step Functions retries the throttled invokes.
- Lambdas in the VPC reach RDS privately and reach Bedrock, S3 and SQS through VPC endpoints, so there is no NAT gateway (tens of dollars a month). This works only with the model on Bedrock EU, not the direct Anthropic API.

**Local:**
- Each handler is a thin wrapper around a plain function of the engine, so `pnpm process` runs the same steps in one process.
- `ENV=local` handlers return the next step's input, for chaining by hand.
- SAM local is only for testing the images.

Alternative if the web app stays on Vercel: Neon instead of RDS (no public RDS endpoint needed), Cloudflare R2 EU instead of S3 ($0.015/GB, no egress fee; domain on Cloudflare; CDN cache is global unless Enterprise).

## Rejected
Trigger.dev (data stored in AWS us-east-1 per its DPA) and Inngest (no EU option documented); Firebase (Auth processes data only in the US); Turso and D1 (above); Scaleway (no PITR).

## To verify at M3
Neon, Vercel and Databricks DPAs and sub-processor lists; PlanetScale EU prices; Step Functions prices in Frankfurt and inline `Map` concurrency limits; Lambda price in Frankfurt; where the web app runs (Lambda with a Next.js adapter, Fargate, or Vercel).

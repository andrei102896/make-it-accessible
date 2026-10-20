# Costs

What Make It Accessible costs to run, and what a venue leaves after costs. One person runs it on Andrei's Romanian PFA: no employees, no money to hire, so every cost below is a service, never a person. Prices are list prices without VAT, checked on 2026-10-13 (AWS Frankfurt and Anthropic from their official price feeds, the rest from the vendors' pricing pages); recheck before committing to a plan's price.

## Fixed costs per month

| Item | Production | Minimal | Why |
|---|---|---|---|
| RDS PostgreSQL, db.t4g.micro, 20 GB | $32.49 (Multi-AZ) | $16.61 (Single-AZ) | Multi-AZ fails over on its own |
| NAT + public IPv4 | $41.87 (NAT Gateway) | ~$7 (NAT instance on EC2) | the worker Lambda in the VPC reaches the model API through it; open decision below |
| Web app hosting | $20 (Vercel Pro) | ~$5 | Vercel Hobby forbids commercial use |
| Transactional email | $15 (Postmark) | ~$1 (Amazon SES) | sign-in links, "your document is ready" |
| Error monitoring | $26 (Sentry Team) | $0 (Sentry free) | |
| Support mailbox | ~$7.50 (Google Workspace) | ~$7.50 | |
| Secrets Manager, Route 53, logs, S3 base | ~$3.85 | ~$3.85 | |
| Domain | ~$1.25 | ~$1.25 | |
| CloudFront | $0 | $0 | free tier covers 1 TB a month |
| **Total** | **~$148** | **~$42** | a WAF adds $10.60 |

Start on the minimal column and move a line to production when paying customers need it (Multi-AZ, Postmark deliverability, Sentry retention).

## Variable cost per page

**Model.** Measured in stage 0 with Sonnet 5.5 ($2 / $10 per million input / output tokens): $0.04 per text page to $0.07 per grid page. The Batch API halves it, so $0.035 is the batch figure used below and $0.07 the worst case.

**AWS, without the model:**

| Item | Assumption | Per page |
|---|---|---|
| Lambda, render (Poppler, model image, crops) | 2 GB × 10 s × $0.0000133 per GB-s | $0.00027 |
| Lambda, model call and HTML | 1 GB × 60 s, billed while it waits for the model | $0.00080 |
| Step Functions | ~15 transitions × $0.025 per 1,000 | $0.00038 |
| S3 requests | ~10 PUT + 20 GET | $0.00006 |
| S3 storage | ~2.5 MB per page (PDF share, model image, HTML images, HTML) | $0.00006 per month kept |
| NAT data | ~1.5 MB × $0.052 per GB | $0.00008 |
| CloudWatch logs | ~50 KB × $0.63 per GB | $0.00003 |
| **Total** | | **~$0.0017** |

With the Batch API the Lambda no longer waits for the model (Step Functions polls the batch), which brings Lambda to ~$0.0004 per page. The permanent free tier (400,000 GB-s of Lambda, 4,000 Step Functions transitions a month) covers roughly the first 5,000 pages a month of Lambda. The tables below round AWS up to $0.002 per page.

**Growing with time, not with each page:** stored pages (10,000 pages ≈ 25 GB ≈ $0.61 a month; a 30-day rule on model images halves it), published pages over CloudFront (1 TB a month free, about 3 million views of a ~0.3 MB page, then $0.085 per GB), the Poppler container image in ECR (~$0.05 a month). Database backups up to the database size, AWS-managed keys and 2,000 GitHub Actions minutes a month are free.

## Payments: Stripe (Andrei, 2026-10-18)

Stripe Checkout, Billing and Tax, with the payout to the PFA. Fees to verify on Stripe's UK page before launch: UK cards about 1.5 % + 20p, other cards about 2.9 % + 30¢ (+1.5 % international), Billing about 0.7 % of recurring revenue, Tax 0.5 %. On a £300 annual plan that is about £8 a year (~2.7 % + 20p). Stripe leaves the tax filings with us: how the PFA declares VAT on a service sold to UK and US businesses is asked of an accountant once, before the first invoice (Andrei bills Howies as a private person meanwhile).

## Profit per venue (2026-10-20)

Measured model cost: $0.069 a page on average, $0.055 median, $0.118 at p90 (209 pages, 98 documents, out/rebuilt cost.json). An update reprocesses only the pages that changed (readings are stored by page hash, `docs/INFRA_RESEARCH.md`).

| Venue | Pages | Updates | Model a month | Price a month (annual) | Stripe | **Left a month** |
|---|---|---|---|---|---|---|
| Typical (Howies: 38 pages for 3 venues) | 13 | every page, 4 times a year | ~$0.30 | £25 founding / £29 list | ~£0.70 | **~£24 / ~£28** |
| Heavy | 60 (the cap) | every page, monthly | ~$7 | same | ~£0.70 | **~£19 / ~£23** |

AWS adds ~$0.002 a page. Break-even against the fixed costs above (~£33 minimal, ~£116 production at ~$1.27 to the pound, to verify): 2 venues on the minimal column, 5 founding venues on production. The model share of revenue stays under 25 % even for a heavy venue.

## Trials

One trial is one PDF of up to 10 pages: ~$0.35 on the batch lane, $0.70 worst. Trials get a hard monthly cap on model spend ($20 at launch, ~28–57 trials); past it, new trials wait for the next month. AWS gives a new account up to $200 in credits (verify at sign-up), which covers the AWS part of the minimal column (~$29 a month) for the first months; before the first customer the spend is roughly $15–35 a month while the credits last, $42–62 after.

## Open decision: the NAT

At $41.87 the NAT Gateway alone costs as much as the whole minimal column. Options for M3, none priced yet beyond the two above:
- NAT instance on EC2 (~$7): cheap, but one more machine to patch and a single point of failure.
- Model on Bedrock EU through a VPC endpoint: no NAT for the model, but interface endpoints have their own hourly price and Bedrock's EU price must be checked.
- Worker Lambda outside the VPC and the database reached over TLS with IAM auth, or a database with a public endpoint (Neon, `docs/INFRA_RESEARCH.md`).

## Not calculated

- Accountant, income tax and VAT on the PFA: depend on the PFA's regime; checked once at setup.
- Legal pages: start from openly licensed templates (terms, privacy, DPA); Stripe Checkout's terms cover the purchase; ours add the fair-use clause (SPEC §6). The product never promises "compliant" or "certified", which keeps the liability low.
- Professional liability insurance: quoted when a larger customer asks for it.
- US-only processing: Anthropic adds 10% to the model cost; offered as a paid option to the customers who ask, so it is not our cost.
- Bedrock's EU price, if the model moves there.
- Marketing: time, not money, until the first customers (the free check, the converted example, articles on ADA, Section 508 and UK law, direct emails to US and UK retailers and restaurants that publish PDF leaflets).
- Andrei's time, and his employment contract (side activity and ownership of code written outside work hours): checked before launch.

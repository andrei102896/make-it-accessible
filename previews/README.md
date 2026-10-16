# Previews

Converted pages prospects get a private link to. Each file is unlisted (random suffix, `noindex`, `X-Robots-Tag` from `_headers`) and is deleted 30 days after it was added unless the owner keeps it; `EXPIRY.csv` holds the dates. The pages and the list stay out of git (prospects' content); only this file, `_headers` and the empty `index.html` are tracked.

- `pnpm preview:add <page.html> "<Business>"` copies a page in and records its date.
- `pnpm preview:publish` deploys the folder to Cloudflare Pages (project `mia-previews`); needs `npx wrangler login` once.
- `pnpm preview:expire` removes the pages past their date (`--remove <file>` for one); publish again afterwards.

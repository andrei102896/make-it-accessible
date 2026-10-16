# Previews

Converted pages prospects get a private link to, served from the portfolio site (https://andreiprojects.com/preview/<file>). Each file is unlisted (random suffix, `noindex`) and is deleted 30 days after it was added unless the owner keeps it; `EXPIRY.csv` holds the dates. The pages and the list stay out of git (prospects' content); only this file is tracked.

- `pnpm preview:add <page.html> "<Business>"` copies a page in and records its date.
- `pnpm preview:publish [--removed <file> ...]` copies the listed pages into `../portofolio/public/preview/`; Andrei then runs `vercel --prod` in the portfolio (his Vercel login).
- `pnpm preview:expire [--remove <file>]` removes the pages past their date (or one) from the list; pass the names to `preview:publish --removed` so they leave the site too.

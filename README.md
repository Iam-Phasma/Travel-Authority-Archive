# Travel Authority Archive

Internal web application for managing travel authority records. This repository contains the app source, supporting SQL, and deployment assets.

Vercel: https://travel-authority-archive-fr1i.vercel.app/
Pages: https://iam-phasma.github.io/Travel-Authority-Archive/

## Project Notes

- The app is built with Vite, HTML, CSS, and vanilla JavaScript.
- Default `npm run build` output is configured for root-host deployments (for example, Vercel).
- Use `npm run build:github-pages` for GitHub Pages deployments under `/Travel-Authority-Archive/`.
- Back-end services and environment-specific configuration live outside the front-end entry points.
- Keep secrets and production-specific values out of source control.
- Review the SQL and Supabase function files before making back-end changes.

## Deploy To Vercel

1. Import this repository in Vercel.
2. Framework preset: `Vite`.
3. Build command: `npm run build`.
4. Output directory: `dist`.
5. Add these environment variables in Vercel project settings:
	- `VITE_SUPABASE_URL`
	- `VITE_SUPABASE_ANON_KEY`
	- `VITE_PRODUCTION_URL` (set this to your Vercel production URL or custom domain)
6. Redeploy after setting variables.

Notes:
- `vercel.json` includes rewrites so `/admin` and `/dashboard` resolve to their HTML entry pages.
- If you are using Supabase Edge Functions, include your Vercel domain in `CORS_ALLOWED_ORIGINS` for each function deployment.

## Repository Layout

- `admin/` - administrative UI modules
- `dashboard/` - user-facing dashboard views
- `footer/` and `header/` - shared layout components
- `pdf-generator/` - document generation helpers
- `sql/` - database migrations and policy scripts
- `supabase/functions/` - server-side functions
- `scripts/` - build and maintenance utilities


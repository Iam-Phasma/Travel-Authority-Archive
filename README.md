# Travel Authority Archive

Internal web application for managing travel authority records. This repository contains the app source, supporting SQL, and deployment assets.

## Local Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Project Notes

- The app is built with Vite, HTML, CSS, and vanilla JavaScript.
- Backend services and environment-specific configuration live outside the frontend entry points.
- Keep secrets and production-specific values out of source control.
- Review the SQL and Supabase function files before making backend changes.

## Repository Layout

- `admin/` - administrative UI modules
- `dashboard/` - user-facing dashboard views
- `footer/` and `header/` - shared layout components
- `pdf-generator/` - document generation helpers
- `sql/` - database migrations and policy scripts
- `supabase/functions/` - server-side functions
- `scripts/` - build and maintenance utilities

## Maintenance

- Review `DESIGN-SYSTEM.md` after UI changes.
- Re-test auth, routing, and record flows after backend updates.

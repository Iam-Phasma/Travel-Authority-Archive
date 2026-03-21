# Travel Authority Archive (CTAA)

A static web application for managing and viewing travel authority records, backed by Supabase.

The project includes:

- Public login and password reset flow with hCaptcha.
- Role-based routing for user, admin, and super users.
- Admin tools for uploading, viewing, and managing travel authority records.
- Official (employee) management and user management controls.
- Dashboard analytics and record browsing for regular users.
- Security hardening with lockouts, rate limiting, session controls, and access revocation.

## Tech Stack

- Frontend: HTML, CSS, vanilla JavaScript
- Backend services: Supabase (Auth, Database, Realtime, Edge Functions)
- PDF and data tools:
  - pdf-lib
  - pdf.js
  - jsPDF
  - SheetJS (xlsx)
- UI utilities:
  - flatpickr
  - zxcvbn
  - hCaptcha

## Project Structure

- `index.html`: Login page and password reset UI
- `config.js`: Frontend Supabase configuration
- `auto-logout.js`: Shared inactivity logout module
- `admin/`: Admin portal
  - `admin.html`: Main admin app shell and logic
  - `upload/`: Upload panel and processing logic
  - `view/`: File/record viewing panel and modals
  - `employees/`: Official management panel and scripts
  - `users/`: User and role management panel
  - `security-documentation.html`: In-app security documentation page
- `dashboard/`: User dashboard and analytics view
- `pdf-generator/`: PDF generation utilities
- `header/`, `footer/`: Shared layout components
- `sql/`: SQL migrations/functions/policy scripts
- `supabase/functions/`: Edge Functions
  - `secure-login/`: Login wrapper with lockout logic
  - `request-password-reset/`: Password reset dispatch with captcha and rate limits

## Prerequisites

- A Supabase project
- Database schema, policies, and RPC functions set up from the SQL scripts in `sql/`
- hCaptcha site key (frontend) and secret key (Edge Function)
- A static file server for local development
- Optional: Supabase CLI for Edge Function deployment

## Local Development

Because this app uses ES modules and fetches local HTML partials, run it through an HTTP server (do not open files directly with `file://`).

### Option 1: Python

```bash
python -m http.server 5500
```

Then open:

- `http://localhost:5500/index.html`

### Option 2: Node serve

```bash
npx serve .
```

## Frontend Configuration

Update `config.js` with your project values:

- `url`: Supabase project URL
- `anonKey`: Supabase anon public key
- `productionUrl`: Deployed app URL used in reset redirects

Notes:

- Never commit private secrets.
- The anon key is public by design, so enforce access with strict RLS policies.

## Database Setup

Apply the SQL scripts in `sql/` to your Supabase project.

These scripts include:

- Login lockout and rate-limiting functions
- Password reset rate-limiting
- Session token and online status support
- Role/access control hardening
- Travel authority policy updates

If you are starting fresh, apply scripts carefully in logical dependency order (tables/columns before functions/policies).

## Edge Functions

This repository includes two Supabase Edge Functions:

1. `secure-login`

- Invoked from `index.html`
- Validates credentials and updates lockout state via RPC
- Returns standardized auth responses for the UI

2. `request-password-reset`

- Invoked from `index.html`
- Verifies hCaptcha server-side
- Applies email/IP rate limits via RPC
- Dispatches reset email with a configured redirect URL

### Required Edge Function Environment Variables

For `secure-login`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`

For `request-password-reset`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `HCAPTCHA_SECRET`
- `PASSWORD_RESET_REDIRECT_URL`

## Authentication and Roles

Roles used by the app:

- `user`: Access to dashboard and records viewing
- `admin`: Access to admin panels (upload/view/official management)
- `super`: Admin access plus user/role management and additional privileged controls

Routing behavior:

- Login redirects users to either `dashboard/dashboard.html` or `admin/admin.html` based on role.
- Client checks improve UX, but real authorization must be enforced through Supabase RLS and RPC rules.

## Security Features (Implemented)

- hCaptcha on login and password reset
- Failed login lockout and network abuse throttling
- Password reset request rate limiting (email and IP)
- Generic password reset messaging to reduce account enumeration risk
- Auto logout after inactivity with warning countdown
- Access revocation monitoring through Realtime
- Single-session guard using a server-validated session token
- Periodic session revalidation on protected routes
- Super-user safeguards for sensitive role/access operations

## Deployment Notes

This project can be hosted as static files (for example GitHub Pages).

Before production deployment:

- Set `productionUrl` in `config.js` to your real public URL
- Ensure Supabase Auth redirect URLs include your production login page
- Deploy Edge Functions and set all required environment variables
- Re-check RLS policies and RPC permissions for least privilege

## Troubleshooting

- Login fails immediately:
  - Verify `config.js` URL/key values
  - Confirm Edge Function deployment and env vars
- Password reset link does not work:
  - Verify `PASSWORD_RESET_REDIRECT_URL`
  - Confirm Supabase Auth redirect allow-list settings
- Admin features unavailable:
  - Confirm `profiles.role` and `profiles.access_enabled`
  - Verify policy/RPC grants for admin and super users
- Blank panels or missing content:
  - Ensure app is served via HTTP, not opened as local files

## Maintenance

- Keep third-party CDN dependencies updated.
- Review `admin/security-documentation.html` after major auth/security changes.
- Re-test role transitions, lockout flows, and reset flows after SQL or function changes.

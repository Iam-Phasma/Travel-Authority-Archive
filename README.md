# Travel Authority Archive (CTAA)

A private, internal web application for managing and viewing travel authority records, backed by Supabase, and built with Vite.

**Live site:** https://iam-phasma.github.io/Travel-Authority-Archive/

---

## Overview

This project is an internal tool that provides:

- A public login and password-reset flow secured with hCaptcha.
- Role-based routing for `user`, `admin`, and `super` roles.
- Admin tools for uploading, viewing, drafting, and managing travel authority records.
- A TA (Travel Authority) drafting module with a built-in Leaflet/Nominatim map-based destination picker.
- Official (employee) management and user/role management controls.
- Dashboard analytics and record browsing for regular users.
- Security hardening: login lockout, rate limiting, session controls, access revocation monitoring via Realtime, and automatic inactivity logout.

## Tech Stack

- **Build tool:** Vite
- **Frontend:** HTML, CSS, vanilla JavaScript (ES modules)
- **Backend/Database:** Supabase (Auth, PostgreSQL, Realtime, Edge Functions)
- **Key libraries:**
  - [@supabase/supabase-js](https://github.com/supabase/supabase-js) — Supabase client
  - [pdf-lib](https://github.com/Hopding/pdf-lib), [pdf.js](https://mozilla.github.io/pdf.js/), [jsPDF](https://github.com/parallax/jsPDF) — PDF handling
  - [SheetJS (xlsx)](https://sheetjs.com/) — spreadsheet processing
  - [Chart.js](https://www.chartjs.org/) — dashboard analytics charts
  - [Leaflet](https://leafletjs.com/) — interactive map picker (with Nominatim geocoding)
  - [flatpickr](https://flatpickr.js.org/) — date pickers
  - [zxcvbn](https://github.com/dropbox/zxcvbn) — password strength estimation
  - [hCaptcha](https://www.hcaptcha.com/) — bot protection
  - [@lottiefiles/dotlottie-wc](https://github.com/LottieFiles/dotlottie-wc) — Lottie animations

## Project Structure

```
.
├── index.html                  # Login page & password reset UI
├── main.js                     # Vite JS entry point
├── config.js                   # Supabase configuration
├── auto-logout.js              # Inactivity logout module
├── styles.css                  # Global styles
├── DESIGN-SYSTEM.md            # Visual/UI design reference
│
├── admin/                      # Admin portal
│   ├── admin.html              # Main admin shell & logic
│   ├── admin-settings.js       # Admin localStorage settings
│   ├── upload/                 # Upload panel & processing
│   ├── view/                   # File/record viewing & modals
│   ├── employees/              # Official management
│   ├── users/                  # User & role management
│   └── draft-ta/               # TA drafting & PDF generation
│
├── dashboard/                  # User dashboard & analytics
│   └── dashboard.html
│
├── pdf-generator/              # PDF generation utilities
├── header/                     # Shared header component
├── footer/                     # Shared footer component
├── assets/                     # Static assets (icons, images, etc.)
│
├── sql/                        # SQL migrations, functions, policies
├── supabase/functions/         # Edge Functions
│   ├── secure-login/           # Login wrapper with lockout logic
│   └── request-password-reset/ # Password reset with captcha & rate limits
│
└── scripts/                    # Build/utility scripts
    └── copy-static-files.mjs   # Copies static assets after Vite build
```

## Authentication & Roles

| Role    | Access |
|---------|--------|
| `user`  | Dashboard and records viewing |
| `admin` | Admin panels (upload, view, official management) |
| `super` | All admin access + user/role management & privileged controls |

Login redirects users to the appropriate entry point based on their role. Client-side checks improve UX, but real authorization is enforced through Supabase RLS and RPC policies.

## Security Features

- hCaptcha on login and password-reset forms
- Failed login lockout and network-abuse throttling
- Password-reset rate limiting (per email and IP)
- Generic password-reset messaging to reduce account enumeration risk
- Automatic logout after inactivity with a warning countdown
- Access revocation monitoring via Supabase Realtime
- Single-session guard with a server-validated session token
- Periodic session revalidation on protected routes
- Super-user safeguards for sensitive role/access operations

## Deployment Notes

The project builds to static files via `npm run build` and is hosted on **GitHub Pages**.

Before deploying to production:

- Set `productionUrl` in `config.js` to the real public URL.
- Ensure Supabase Auth redirect URLs include the production login page.
- Deploy Edge Functions and configure their environment variables.
- Review RLS policies and RPC permissions for least-privilege access.

## Edge Functions

Two Supabase Edge Functions are included:

### `secure-login`
- Invoked from the login page.
- Validates credentials and updates lockout state via RPC.
- Returns standardized auth responses for the UI.

**Environment variables:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`

### `request-password-reset`
- Invoked from the login page.
- Verifies hCaptcha server-side.
- Applies email/IP rate limits via RPC.
- Dispatches a reset email with a configured redirect URL.

**Environment variables:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `HCAPTCHA_SECRET`, `PASSWORD_RESET_REDIRECT_URL`

## Database

SQL scripts in `sql/` define the schema, policies, and RPC functions needed by the application, including:

- Login lockout and rate-limiting functions
- Password-reset rate limiting
- Session token and online status support
- Role/access control hardening
- Travel authority policy updates

Apply scripts in logical dependency order (tables/columns before functions/policies).

## Frontend Configuration

`config.js` must be updated with your project's Supabase values:

| Key              | Description |
|------------------|-------------|
| `url`            | Supabase project URL |
| `anonKey`        | Supabase anonymous public key |
| `productionUrl`  | Deployed app URL (used for reset redirects) |

> The anon key is public by design — enforce access with strict RLS policies. Never commit private secrets.

## Troubleshooting

- **Login fails immediately** — Verify `config.js` URL/key values; confirm Edge Function deployment and environment variables.
- **Password reset link doesn't work** — Check `PASSWORD_RESET_REDIRECT_URL` and Supabase Auth redirect allow-list settings.
- **Admin features unavailable** — Confirm `profiles.role` and `profiles.access_enabled` in the database; verify policy/RPC grants for admin/super roles.
- **Blank panels or missing content** — Ensure the app is served via HTTP(S), not opened as a `file://` URI.

## Maintenance

- Keep third-party CDN dependencies updated.
- Review `DESIGN-SYSTEM.md` after major style/UI changes.
- Re-test role transitions, lockout flows, and password-reset flows after SQL or Edge Function changes.

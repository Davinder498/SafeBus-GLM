# SafeBus Auth & Onboarding — Local Development

This document explains how to run the full authentication and tenant-onboarding flow locally, including the Netlify Functions that handle invitation emails and account activation.

## How local functions work

The Vite dev server (`pnpm dev`) includes a custom plugin (`apps/web/vite-plugin-netlify-functions.ts`) that serves the Netlify Functions locally. When you call `fetch('/.netlify/functions/safebus-onboarding')`, the plugin dynamically imports the handler from `apps/web/netlify/functions/safebus-onboarding.mjs`, invokes it with a Netlify-shaped event, and returns the JSON response.

This means **`pnpm dev` works end-to-end** — no separate Netlify CLI process is required for local development. (You can still use `pnpm dev:netlify` if you prefer the official Netlify CLI proxy.)

The plugin loads **all** variables from `apps/web/.env` into `process.env` (not just `VITE_`-prefixed ones), so server-side secrets like `SUPABASE_SECRET_KEY` are available to the functions. The plugin only runs during `vite dev` and is never bundled into production.


## Prerequisites

1. Node.js ≥ 20
2. `pnpm install` has run (installs `netlify-cli` as a dev dependency)
3. A hosted Supabase DEV project with migrations `0001`–`0063` applied
4. Your Supabase project has **Email auth** enabled and an email provider configured (even the built-in dev mailer works for invitations)

In Supabase **Authentication → URL Configuration**, add these exact local redirect URLs:

```text
http://localhost:5173/accept-invitation
http://localhost:5173/update-password
```

Keep the production callbacks too:

```text
https://bussafe.netlify.app/accept-invitation
https://bussafe.netlify.app/update-password
```

In **Authentication → Email Templates**, the action link in both **Invite user**
and **Reset password** must use `{{ .ConfirmationURL }}`. Initial invitations
use the Invite user template; resends use the Reset password template to issue
a fresh password-setup session for the existing invited profile.

## 1. Set up environment variables

Create `apps/web/.env` (this file is git-ignored):

```bash
# Frontend (Vite-exposed)
VITE_SUPABASE_URL=https://YOUR-DEV-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-dev-anon-key

# Netlify Functions (server-only — NEVER prefix with VITE_)
SUPABASE_URL=https://YOUR-DEV-PROJECT.supabase.co
SUPABASE_ANON_KEY=your-dev-anon-key
SUPABASE_SECRET_KEY=your-dev-service-role-key
SAFEBUS_INVITE_REDIRECT_URL=http://localhost:5173/accept-invitation
```

> **Privacy rule (AGENTS.md):** never put `SUPABASE_SECRET_KEY` (the service role key) in a `VITE_` variable, in frontend code, or in committed files. The Netlify CLI reads it from the server-side environment only.

For the built-in Vite function middleware, the same secret stays only in the
Node dev-server process. Vite exposes only `VITE_`-prefixed variables to browser
code.

## 2. Seed a platform super admin (one-time, in DEV only)

The platform super admin is the only role that can create tenants and invite the first tenant admin. In your hosted Supabase DEV SQL Editor, run:

```sql
-- 1. Create the auth user (or invite them via Supabase dashboard)
-- 2. Insert the profile row:
insert into public.profiles (id, tenant_id, full_name, email, role, status, first_name, last_name)
select
  auth.users.id,
  null,
  'Platform Admin',
  'platform-admin@example.ca',
  'platform_super_admin',
  'active',
  'Platform',
  'Admin'
from auth.users
where email = 'platform-admin@example.ca';
```

Set a password for this user in the Supabase Auth dashboard so you can sign in.

## 3. Start the app

**Option A — Vite with built-in function serving (recommended for local dev):**

```bash
pnpm dev
```

Open **http://localhost:5173**. The custom Vite plugin serves the Netlify Functions directly, so `/.netlify/functions/*` requests work without any proxy.

**Option B — Netlify CLI (closer to production):**

```bash
pnpm dev:netlify
```

Open **http://localhost:8888**. This uses the official Netlify CLI proxy.

When using Option B, change `SAFEBUS_INVITE_REDIRECT_URL` to
`http://localhost:8888/accept-invitation` before sending the test invitation.

## 4. End-to-end smoke test

1. Sign in as the platform super admin at `/login`.
2. Go to **Tenant onboarding** (`/admin/tenants`).
3. Fill in **Create tenant and first admin**:
   - Tenant name, type, optional school + city
   - Admin full name + email
4. Click **Create tenant and send invitation**.
   - Supabase sends an invitation email to the admin.
   - The tenant and an `invited`-status admin profile are created atomically.
5. In the invitee's inbox, click the link. It lands them on `/accept-invitation` where they set a password.
6. On submit, `complete_invited_account()` flips the profile `invited → active`, and the tenant admin is routed to `/admin`.

## 5. Re-sending / cancelling invitations

From the same **Tenant onboarding** page, pending invitations show **Resend** and **Cancel** buttons. Resend issues a fresh password-setup email (Supabase `resetPasswordForEmail` with `redirectTo=/accept-invitation`); Cancel disables the invited profile and bans its auth user.

---

## Architecture reference

| Layer | File | Responsibility |
|---|---|---|
| Platform admin UI | `apps/web/src/pages/PlatformTenantsPage.tsx` | Create tenant + admin, manage lifecycle |
| Onboarding service | `apps/web/src/services/onboardingService.ts` | Calls the Netlify Function |
| Netlify Function | `apps/web/netlify/functions/safebus-onboarding.mjs` | Invites auth user, runs atomic finalize RPC |
| Finalize RPC | `platform_finalize_tenant_invitation` (migration `0049`) | Creates tenant + admin profile atomically |
| Activation RPC | `complete_invited_account` (migration `0048`) | `invited → active` after password set |
| Accept page | `apps/web/src/pages/AcceptInvitationPage.tsx` | Set password + activate |
| Reset page | `apps/web/src/pages/ResetPasswordPage.tsx` | Request reset link |
| Update page | `apps/web/src/pages/UpdatePasswordPage.tsx` | Set new password |
| Auth context | `apps/web/src/contexts/AuthContext.tsx` | Session, profile, all auth methods |

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| "onboarding service is unreachable (HTTP 404)" | Function plugin disabled or `pnpm build`/`preview` (no dev plugin) | Run via `pnpm dev` or `pnpm dev:netlify`. `vite preview` does not serve functions. |
| "Server onboarding is not configured" | Missing server env vars | Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` to `apps/web/.env` |
| "The function crashed during local development" | Runtime error in the handler | Check the Vite dev server terminal for the full stack trace |
| "onboarding service is unreachable (HTTP 404)" | Function route not matched | Confirm `netlify.toml` `[functions] directory = "apps/web/netlify/functions"` |
| "Server onboarding is not configured" | Missing server env vars | Add `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SECRET_KEY` to `.env` |
| "Sign in required" | No session token | Sign in at `/login` first |
| Resend reports an email rate limit | Supabase built-in mail quota was reached | Wait for the Auth email window to reset or configure custom SMTP, then retry once |
| Link opens the site root | Redirect URL was rejected or an older email was opened | Use the newest email; the app recovers invited root sessions to `/accept-invitation`, but the exact callback should still be allow-listed |
| Invite email never arrives | Supabase email not configured | Check Supabase → Auth → Email Templates + provider |
| `complete_invited_account` fails | Migration not applied | Apply migration `0048` to hosted DEV |
| `platform_finalize_tenant_invitation` fails | Migration not applied | Apply migration `0049` to hosted DEV |

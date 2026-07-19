# Invitation Password Activation Acceptance

Use hosted Supabase DEV and a non-production Netlify deployment only. Do not
apply this migration or change production Auth settings without human approval.

## Hosted DEV setup

1. Apply `supabase/migrations/0048_invitation_password_activation.sql`, followed
   by `supabase/migrations/0049_atomic_platform_tenant_invitation.sql`, in the
   hosted Supabase DEV SQL Editor.
2. In Supabase Auth URL configuration, allow the deployed DEV callback:
   `https://<dev-app-host>/accept-invitation`.
3. Set the server-side Netlify environment variable
   `SAFEBUS_INVITE_REDIRECT_URL` to the DEV application origin or that callback
   URL. The onboarding function normalizes it to `/accept-invitation`.
4. Keep `SUPABASE_SERVICE_ROLE_KEY` server-only. Never place it in a Vite
   variable, browser bundle, documentation value, log, or screenshot.
5. Keep the Supabase Invite User email template linked through
   `{{ .ConfirmationURL }}`. Disable email-link tracking. For production,
   configure custom SMTP and consider the documented OTP/intermediate-page
   mitigation when the recipient's email security system prefetches links.
6. Configure a Supabase password minimum of at least eight characters. Enable
   stronger character requirements and leaked-password protection when
   appropriate for the project plan.

## Invitation workflow

Repeat for a tenant admin, driver, and guardian:

1. Send a new invitation from the correct administrator.
2. Confirm the email link opens `/accept-invitation`, not `/login` or a role
   dashboard.
3. Confirm the account remains `invited` and cannot open a protected dashboard
   before password creation.
4. Enter mismatched passwords and confirm activation is blocked.
5. Enter a password shorter than eight characters and confirm activation is
   blocked.
6. Enter and confirm a valid password.
7. Confirm the profile changes to `active`, the matching invitation changes to
   `activated`, and the user reaches only the dashboard for the assigned role.
8. Sign out and sign back in with the new password.
9. Reopen the already-used link and confirm SafeBus does not show the password
   form for an active account.
10. Resend an expired invitation and confirm the replacement link uses the same
    password-setup page.

## Platform tenant-admin lifecycle

1. Sign in as the platform super admin and open Tenant onboarding.
2. Submit an invalid or already-profiled administrator email. Confirm the error
   explicitly says the invitation was not sent and no tenant was created.
3. Confirm no tenant card appears for the failed request and that empty tenant
   attempts with no admin profile are absent from the summary.
4. Submit a valid administrator email. Confirm the success message names the
   recipient and the tenant card appears only after that response.
5. Delete a DEV-only invited profile while leaving its Supabase Auth user,
   retry the same email, and confirm SafeBus sends account recovery instead of
   creating a duplicate or another empty tenant.
6. Confirm a pending tenant admin shows `Password setup pending` and cannot be
   manually activated before accepting the invitation.
7. After invitation completion, choose **Deactivate admin**.
8. Confirm the profile status becomes `disabled`, new sign-ins are blocked, and
   tenant data operations are denied immediately by the active-profile checks.
9. Choose **Reactivate admin** and confirm sign-in works again with the same
   password.
10. Suspend the whole tenant and confirm its administrator cannot be reactivated
    until the tenant record is active.
11. Cancel a pending invitation and confirm its invited profile is disabled and
    the old link cannot be used.

## Password recovery regression

1. Request a password reset from `/reset-password`.
2. Confirm the email opens `/update-password`.
3. Set and confirm a valid password.
4. Confirm the user can access only their assigned dashboard and can sign in
   again with the new password.

## Automated validation

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:rls
pnpm exec playwright test tests/smoke/invitation-password-activation.spec.ts --project=desktop-chromium
pnpm exec playwright test tests/smoke/platform-tenant-invitation-atomicity.spec.ts
```

After applying migrations `0048` and `0049` to hosted Supabase DEV, run the
guarded database tests only against DEV:

```bash
pnpm test:rls:dev -- tests/rls/invitation-password-activation-rls.sql
pnpm test:rls:dev -- tests/rls/atomic-platform-tenant-invitation-rls.sql
```

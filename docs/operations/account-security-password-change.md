# Unified SafeBus Account Security

## Scope

Shared account-security navigation for platform super admins, district admins,
transportation admins, drivers and guardians.

- `/account/security` — authenticated Account Security hub
- `/account/security/password` — current-password change
- `/account/security/mfa` — existing TOTP MFA management
- `/mfa` — mandatory sign-in verification / first-time admin enrollment (unchanged)
- `/update-password`, `/reset-password`, `/accept-invitation` — recovery/invitation flows (unchanged)

Role-specific navigation uses the existing web admin or Android driver/guardian
shell. `MfaSettingsCard` is reused in the hub and replaced in ordinary settings
with a role-neutral Account Security link.

## Password security

The signed-in password form requires the current password, a new password of at
least 12 characters, and confirmation. The server-side SafeBus password policy
RPC is reused. The new account-security service **verifies the current
password** with an isolated, non-persistent Supabase Auth client (the verified
user ID must equal the signed-in account's trusted Auth user ID) before calling
`updateUser({ current_password, password })` on the existing signed-in client.
It fails closed on missing/incorrect credentials. Passwords are never sent to
analytics, logs, application database or audit event payloads.

**Production setting (recommended defense-in-depth):** Confirm that the SafeBus
Supabase project enables **Authentication → Providers → Email → Require current
password when changing password** (label may vary). This setting makes GoTrue
validate the provided `current_password` again on the actual update. The
Supabase management connector cannot read/write that hosted Auth setting.
Do not assume this setting is enabled or claim that it was changed.

**Important session caveat:** The isolated verification performs an actual
password sign-in with a temporary session. If the project enforces a single
session per user, the sign-in could invalidate the original session. Validate
session settings and driver GPS tracking on DEV before releasing to drivers.
The temporary proof client does not persist or refresh its session and is
signed out locally, without affecting the application client's local storage.
If single-session enforcement is enabled, switch to a provider-only current
password verification design before production roll-out.

## Verification required

- Run `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`
- Run browser and Android UI suites
- On hosted DEV, test all five roles, existing MFA reauthentication, incorrect
  current passwords, weak passwords, mismatch, existing-account password
  change, forgotten-password recovery, invitation acceptance and resend.
- Check one active-driver-trip scenario with a test bus/device. Password change
  must not silently stop tracking or invalidate a session unexpectedly.
- Confirm security-notification configuration separately if password-change
  confirmation emails are desired. The invitation/recovery SMTP templates do
  not automatically configure password-changed notifications.

No new migration or transport-domain logic is required.

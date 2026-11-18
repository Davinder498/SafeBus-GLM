# Recovery Auth preparation

Status: dashboard isolation reviewed; protected Auth check prepared, not executed.

The owner approved isolated account and sign-in preparation after recovery runtime
security installation. The named target remains `deladookciebwvqojhkv` only.

## Observed dashboard configuration

On November 17, 2026, public signups were disabled and persistence verified after
reloading the provider settings page. Anonymous sign-in and manual identity linking
are disabled; email/password is enabled with email confirmation retained. All other
listed providers are disabled, with no custom providers. TOTP is enabled, with the
15-minute AAL1 limit for enrolled users enabled. No custom Auth hooks or custom SMTP
are configured. Security-event email switches were off. These dashboard settings
are separate from the installed PostgREST pre-request hook.

The organization dashboard reports production BusSafe database size 694.57 MB,
above the Free-plan 0.5 GB per-project allowance. Recovery is 43.76 MB. Log ingestion
is 2.015 GB against the displayed 1 GB allowance; its page says billing starts after
the grace period in early 2027. This is not permission for a paid upgrade or load
execution. Resolve production sizing separately before commercial qualification.

## Bounded Auth check

`check-recovery-auth.yml` validates the reviewed current main SHA before exposing
recovery credentials through the existing protected environment. It uses the
existing recovery database URL/CA plus:

- Secret `SAFEBUS_CAPACITY_AUTH_SECRET`: recovery-only server secret API key (or
  recovery legacy service_role key). Never use the production key.
- Variable `SAFEBUS_CAPACITY_PUBLISHABLE_KEY`: recovery publishable API key (or its
  legacy anon key).

Keep keys out of chat, source control and artifacts. Dispatch on main with the full
reviewed SHA and `CHECK_RECOVERY_AUTH`. The runner verifies the named staging binding,
empty user/tenant/job/secret/storage baseline, absent custom Auth-table triggers,
application schema quarantine, and disabled public signups. It takes the same
schema-deployment advisory lock as other recovery preparation. HTTP destinations
are fixed to recovery and redirects are rejected.

It creates exactly two disposable accounts at unique example.test addresses via
Auth Admin createUser with email_confirm, not signup/invite/email-OTP endpoints.
Passwords, JWTs, refresh tokens and the temporary TOTP secret exist only in process
memory and are never printed or saved. Each account signs in through Auth, is
verified through getUser, and must have a real database session. The second enrolls
and verifies TOTP to AAL2. Both refresh, sign out, and must fail to reuse the revoked
refresh token. No persistent application profiles, tenant grants or API enablement
are included.

Cleanup deletes only accounts whose IDs were selected by this run's exact metadata
marker AND exact two email addresses. It also discovers a created account if the
create HTTP response was lost. It verifies zero users/sessions and retained schema
quarantine before writing non-secret evidence. Interrupted or failed cleanup may
leave test accounts; do not bypass the empty-target guard. Inspect and remove only
that run's scoped synthetic accounts before retrying. Auth audit logs are expected
to remain; the check does not erase provider audit evidence.

## Evidence limits and next step

Local tests validate key/project rejection and TOTP against RFC 6238 vectors; they
are not hosted sign-in evidence. A successful protected run would establish Auth
password login, refresh/revocation and TOTP, not application-role authorization,
PostgREST hook execution, private Realtime delivery or fleet capacity. Existing
rollback-only database role checks remain separate evidence. Only after this check
should the reviewed application fixture and bounded API/Realtime smoke stage be
prepared, keeping recipient notifications separate from concurrent map viewers.

Reference: https://supabase.com/docs/reference/javascript/auth-admin-createuser

## Hosted result

Run https://github.com/Davinder498/SafeBus-GLM/actions/runs/44199785857
passed on `04ca487a4a9bafacf9d7c4c051785f1bbb3b5159`.
Password login, TOTP, refresh, revoked-refresh rejection and cleanup succeeded.
Both disposable users and their sessions were removed; schema quarantine remained.
This does not establish application API, Realtime or capacity qualification.

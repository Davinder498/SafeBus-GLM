# Leaked-password protection release

Acceptance defined before implementation: enable the hosted Auth
`password_hibp_enabled` protection through reviewed main and the protected
production environment. Record its prior boolean before changing it, PATCH only
that one setting, and verify the setting from a fresh GET. Do not change users,
passwords, sessions, MFA, mail settings, redirect URLs or other Auth settings.

This protects new/changed passwords for every supported role. Current-password
proof, administrator MFA, optional guardian/driver MFA, account/authority scope
and recipient delivery choices remain unchanged. No real password, sign-in or
notification is used as QA. Retired roles gain no access.

Only the protection boolean is written to evidence. The Management API can return
SMTP/provider secrets; complete responses and access tokens must never enter
logs or artifacts. Missing access, a missing setting, unsupported plan or failed
verification must fail visibly without claiming completion.

Official API references checked on November 4 UTC:
- https://supabase.com/docs/reference/api/v1-get-auth-service-config
- https://supabase.com/docs/reference/api/v1-update-auth-service-config
- https://supabase.com/docs/guides/auth/password-security

After merge, run Release Auth password protection in inspect mode first, then
enable for the exact reviewed current main SHA. The enable run records and
retains its own fresh before-state before applying the single-field patch. The
workflow cannot disable protection or upgrade a paid plan. Verify the live flag
and security advisor after completion. This document is not installation evidence.

Live dependency confirmed in the dashboard: BusSafe's organization is on the
Free plan. Leaked-password protection requires Pro or above. The plan selector
quotes Pro from $25/month, with usage-based additions. No plan change or payment
was made. The protected enable path is prepared so the setting can be enabled
and verified after the owner decides on the subscription dependency.

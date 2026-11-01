# BusSafe: privileged RPC security audit — initial read-only triage

**Date:** 2026-11-01  
**Project:** BusSafe / `ckrkfylsyihwouvesypm`  
**Scope:** Observed live `public`-schema `SECURITY DEFINER` RPCs executable by `authenticated`.

## Baseline, verified read-only

- Supabase advisor reports **145** callable SECURITY DEFINER functions.
- A PostgreSQL catalog inventory also found **145**, with **zero** granting EXECUTE to the `anon` role.
- Current `authenticator` role setting includes `pgrst.db_pre_request=safebus_private.enforce_active_api_session`, an active-session/MFA gate for ordinary PostgREST requests.
- `safebus_private.current_user_role()` rejects the retired `school_admin` role, and profile/invitation retirement triggers were installed in the previous milestone.
- The 145 are **advisory findings, not 145 confirmed vulnerabilities**. Many public RPCs legitimately require a privileged definer and rely on internal role, identity, tenant or ownership checks.
- A string scan highlighted 24 functions that reference `school_admin` literally. Such references are historical technical debt; the central authorization helper now refuses to return that role.
- A simple keyword scan identified functions without obvious direct role/tenant markers; this does **not** prove missing authorization, because helpers and recipient-ownership predicates are common in SafeBus.

## Verified authorization findings

| Source | Verified finding | Response |
|---|---|---|
| `public.admin_create_bus` | Direct profile role whitelist still lists retired `school_admin`; uses district tenant ID for writes | Proposed replacement uses active `safebus_private.current_user_role()` and only `tenant_admin` or `transportation_admin` |
| `public.admin_update_bus` | Same legacy direct-profile role allowance; also filters target bus by caller tenant | Proposed replacement retains tenant, validation and audit but requires the central role helper |
| `safebus_private.require_announcement_admin` | Direct role whitelist accepts historical school-admin role; separately validates current session and MFA | Proposed replacement accepts only district administrators, retaining session, MFA, and active-tenant checks |

**These findings are defense-in-depth hardening; they are not proven exploitable today.** The deployed central-role denial and account/invitation guards already constrain the retired role.

## Other sensitive functions inspected

- `admin_get_printable_qr` checks active caller, district transport-admin helper, tenant and entity before retrieving QR credentials. Token issuance and Vault decryption merit isolated misuse testing.
- `manage_bus_qr_credential` delegates authorization and tenant checks to `safebus_private.manage_bus_qr_before_prints`.
- `manage_student_qr_credential` delegates student and tenant checks to `safebus_private.manage_student_qr_before_prints`.
- `bulk_import_commit` enforces active tenant-admin, MFA, recent authentication, batch tenant and confirmation checks.
- `platform_emergency_admin_recovery` has platform role, MFA, recent-auth and first-tenant-admin checks.
- `get_guardian_bus_visibility_v2` checks guardian role and linked student/tenant context.
- `get_admin_live_fleet_monitoring` and viewport variants filter active tenant and use role restrictions. School-admin branches remain in historical SQL but cannot be authorized by the retired-role helper.

**Important:** Inspection of these function definitions is not equivalent to a passed adversarial multi-tenant test. Privilege review continues for all remaining functions.

## Explicitly open checks and release rules

1. Assess the remaining administrative writers and selectors, including direct-profile role tests and delegation to private helpers.
2. Verify every function's RLS bypass is intentional; check input object ownership, tenant/role binding, MFA, and active-session behavior under authenticated multi-tenant fixtures.
3. Test route overlays, trip-to-stop distance, and route geometry against unrelated tenant IDs and retired-role accounts.
4. Verify guardian/driver authorization and avoid exposing student records, contacts, or credential tokens.
5. Run CI and static regression on any proposed narrow fix before applying a database migration.
6. **Do not revoke all 145 execute grants**; that would break supported SafeBus operations. Avoid changing production SQL in this audit PR.
7. After an authorized deployment, rerun Supabase advisors and record approval, functional test results and rollback evidence.

Supabase advisory: https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable

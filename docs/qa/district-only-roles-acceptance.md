# District-only SafeBus administrator roles — acceptance

**Product rule (2026-11-01):** one school district/school authority is one tenant.
Individual schools do not sign in or administer transportation. Optional
school records describe student/stop locations and do not restrict district
bus, route, or driver operations. Only district `tenant_admin` and
`transportation_admin` roles have district transportation administration.

## Read-only hosted baseline
- 2026-11-01: 3 active tenant_admin accounts, **0 school_admin accounts** on
  the connected SafeBus project. No account was modified during this audit.
- Historic migrations and generated DB enums still include `school_admin`.
  They are kept immutable for migration checks and old-record compatibility.

## Prepared but unapplied
- `supabase/migrations/pending/20261101174500_retire_individual_school_admin.sql`
  suspends existing active/invited legacy profiles, revokes unfinished
  individual-school invitations, denies direct API creation and reactivation,
  and makes the private current-role helper refuse `school_admin`.
- Web admin navigation, invitation forms, Netlify onboarding handler, role
  selection and public permission declarations no longer offer that role.
- This is a **new product/authorization decision** (DL-025). PR review is
  not a substitute for protected database adoption.

## Required synthetic isolated-database acceptance
1. Confirm the deployed function signature, current grants, type enumerations
   and migration preflight/rollback evidence against the exact target.
2. In isolated DEV: seed districts A and B, multiple optional schools per
   district and a school-less route. Seed one legacy school-admin profile with
   a live session, one pending legacy invite, and current tenant/transportation
   admins; record original IDs and roles in protected test logs.
3. Apply pending migration in DEV. Confirm old account is **suspended** (not
   promoted), invitation is revoked, and `current_user_role()` returns null.
4. Attempt insert and role-change to `school_admin` through direct
   `public.profiles`, `tenant_change_admin_role`,
   `tenant_add_sub_administrator`, and onboarding API. All must deny.
5. Attempt restore and re-invite a legacy school admin directly, and resend
   its invitation; all must deny while preserving historical rows.
6. As district A tenant_admin, verify all district A schools, buses, routes,
   stops, drivers, guardians and trip operations remain available regardless
   of `school_id`, while no district B data is accessible.
7. As district A transportation_admin, verify district-wide assigned
   transportation operations, including multi-school and school-less routes;
   keep existing narrow roster personal-data permissions.
8. Verify guardian and driver restrictions, platform tenant-control isolation,
   MFA and revoked-session checks still work unchanged.
9. Execute `tests/rls/district-only-admin-roles-rls.sql` after migration,
   plus existing tenant isolation, phase-6 and current auth/regression suites.
10. Review database security advisors, rollback plan, change logs, and
    approvals. Only then may the protected production release apply migration.

**No production SQL deployment or account changes are authorized by this PR.**
School-admin enum label and old applied migrations intentionally remain as
historical compatibility objects.

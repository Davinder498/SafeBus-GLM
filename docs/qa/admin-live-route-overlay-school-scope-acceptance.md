# SafeBus route-overlay authorization repair — acceptance checklist

**Prepared / unapplied.** Do not use production data or modify the hosted production database as a test fixture.

## Verified read-only production evidence (2026-11-01)
- `public.get_admin_live_fleet_monitoring()` currently uses `r.school_id = safebus_private.current_school_id()` for school administrators.
- `public.get_admin_live_fleet_monitoring_in_viewport(...)` currently includes that same role-and-school filter.
- `public.get_admin_live_route_overlays()` is `SECURITY DEFINER`, executable by `authenticated`, and permits school-admin access based on tenant and role without restricting `r.school_id`.
- The pending forward migration adds the missing check at the outer joined-route level, **before JSON stop aggregation and geometry output**. A school-admin with no school ID gets no rows.

## Required isolated-environment validation before protected adoption
1. Confirm current and prepared definitions match the deployed return column types and arguments; take a recoverable pre-change snapshot and record approvals.
2. Apply `supabase/migrations/pending/20261101160000_admin_live_route_overlay_school_scope.sql` to an **isolated non-production database only** under approved test controls.
3. Run `tests/rls/admin-live-route-overlay-school-scope-rls.sql` there, verifying auth, explicit school scope, tenant scope, and permissions.
4. Create **synthetic** tenants A and B, two schools A1 and A2 in tenant A, plus a tenant-A route with NULL school. Prepare active trips, route stops and route geometry for each.
5. As MFA-verified tenant admin A: confirm A1/A2/NULL-school routes are returned, and no tenant B rows appear.
6. As MFA-verified transportation admin A: confirm all authorized tenant-A routes appear, no tenant B rows.
7. As MFA-verified school admin A1: confirm only A1 routes, stops and geometry appear; A2, NULL-school and tenant B rows are absent.
8. As school admin A2: confirm only A2 routes. As school admin with missing school ID: confirm zero rows.
9. As tenant B, driver, guardian, platform super admin and unauthenticated caller: confirm tenant-boundary and role denials.
10. Exercise repeated route code, two trip patterns and empty route-shape cases; ensure aggregation, map color, shape version, sorting and fields remain unchanged.
11. Verify direct REST RPC calls cannot bypass the scoped server predicate. Re-run database security advisors and compare grants, and record that no client/service keys appear in payloads.
12. Conduct release review and rollback drill **before** any production migration adoption.

## Hold points
- Passing structural tests, GitHub CI, or the existing UI role gate alone **does not establish** row-level school isolation.
- The same server-scope review remains necessary for other spatial RPCs and route geometry administration.
- No pilot authorization has been granted (`docs/governance/pilot-authorization.json`).

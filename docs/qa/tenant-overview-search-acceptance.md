# Tenant Overview trip search

Overview presents Trips followed by Transportation summary and a link to Live
Operations. Recorded runs only; route management and live monitoring retain their
existing workflows.

## Automated checks

- `pnpm typecheck`, `pnpm lint`, `pnpm build`, `pnpm test`.
- `pnpm exec playwright test tests/smoke/tenant-overview-search.spec.ts tests/smoke/admin-trip-overview.spec.ts tests/smoke/admin-simple-workflow.spec.ts`.
- Browser tests intercept Supabase with placeholders. They cover Alberta midnight,
  all statuses, historical records beyond the recent 200, inclusive ranges,
  pagination, empty results, independent retries, stale success/error responses,
  notes, summary destinations, keyboard use and WCAG checks on desktop/mobile.

## Database adoption gate

Migration `0121_admin_trip_search.sql` is prepared and **unapplied**. Apply it only
through the approved adoption/release workflow. Until then, a missing-function
response (`PGRST202` or `42883`) uses a compatibility query of the existing
operational tables through the authenticated Data API. It verifies the active
administrator profile, retains caller RLS, tenant filters on every joined table,
and the school restriction. Dates and status filter before server pagination
with an exact matching count; it never uses the 200-run legacy overview fallback.
Other errors remain explicit and retryable. Existing APIs and Live Operations
still work. There is one header reload control: Refresh trips normally, Retry
trips after a failure. The failure message uses a compact inline alert.

Read-only existing-database verification on 2026-10-09 confirmed that the search
RPC was absent and one active trip for today was visible through the equivalent
joins under an existing active tenant administrator. The check used transaction-
local claims/role, statement/lock timeouts and rollback; no database writes.

The migration uses security-invoker execution, existing RLS, explicit role/tenant/
school restrictions, authenticated-only execution, inclusive service dates and
server-side status filtering before bounded pagination. No policies or table
grants are expanded. Total count uses exactly the same authorized filtered set.

Static contract tests check these boundaries but do not prove database execution.
After protected adoption, review and run
`tests/rls/admin-trip-search-existing-database-readonly.sql` in the customer-authorized
read-only workflow: local timeouts, transaction-local identities/roles, final
rollback, no fixture writes. Confirm available samples include two tenants and a
school administrator with another school outside its scope; the script explicitly
reports that coverage depends on existing identities. Verify multiple pages and
all four statuses with available real records without altering them.

## Visual acceptance

- At desktop and phone widths, Trips appears before the seven summary links.
- Date controls stack on narrow screens; the table scrolls within its container.
- Today and trip times use `America/Edmonton`; service dates never shift with UTC.
- Date changes require Apply. Status/page-size changes reset to page 1.
- Failed summary loading does not show zero counts. A legitimate zero stays neutral.
- Notes open for the selected trip and close when results change.

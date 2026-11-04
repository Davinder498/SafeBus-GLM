# Detail loading repair acceptance

Acceptance defined before implementation: opening a route loads that route and
its stops, schedules, service days and assignments by server-side route filter.
Related bus, driver and profile metadata is loaded by ID. Bus and driver choices
in route setup use server search and explicit pagination, without downloading
whole directories. Student assignment editing loads stops for available service
routes. Multi-page reads must not silently stop at the API row cap; errors or
changing-page inconsistencies must fail visibly rather than return partial data.

Authority and supported school scope remain enforced by RLS and existing admin
RPCs. This change grants no guardian/driver access to administrator directories,
adds no retired school-admin access, and changes no notification channel or
recipient choice. Platform and unsupported roles retain their existing access.
Selected/returned references must still be authorized and writes remain checked
by the server. Missing and inaccessible routes produce the same unavailable state.

PR review acceptance, November 4: school authority admins retain save confirmations
and form state when the current route refreshes after a successful write. Changing
routes must hide the previous route while the new request is pending. School-scoped
and transportation admins retain their existing read/write scope; guardians,
drivers and platform admins gain no directory access. A failed refresh must still
block the workspace and offer retry. No notification events or channels change.
Browser fixtures must honor table ranges, preserve RPC/single response shapes,
and exercise the searchable bus and driver controls without relaxing assertions.

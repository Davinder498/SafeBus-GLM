# Route service calendar

Prepared on 2026-11-02 from `main` at `d27419f`. This milestone implements route-level weekly closures and exact service dates. School-specific closures, mandatory student/school links, notifications, new trip types, and substitutions are outside this change.

## Acceptance behavior

| User | Behavior |
| --- | --- |
| School authority admin | Saves route details, stops, trip patterns and calendar in one transaction within their authority. Administrator MFA and an active session remain required. |
| Transportation admin | Reads calendars within their authority. Existing route-definition editing permissions stay unchanged; this role cannot use the definition writer. |
| School-scoped admin | The retired school-admin role receives no renewed access. |
| Driver | Existing QR authorization and assignments remain required. New trips are offered and started only on an operating date. Closed or stale selections are rejected by the server. An already active QR trip can resume after closure or overnight. The separate paused-trip resume workflow is unchanged. Optional MFA enrollment remains optional; enrolled MFA stays enforced. |
| Guardian | Existing linked-student and assigned-bus visibility stays unchanged. No calendar mutation, new student access, enrollment, or automatic notification. |
| Platform admin | No route-calendar or trip-start access is added. |

All channels and recipient preferences remain unchanged. No source-event delivery is added or tested by sending notifications. Expired sessions, suspended accounts, missing administrator MFA and foreign-authority access fail through the existing pre-request checks, helpers and RLS.

## Calendar rules

- Weekly calendars use the existing seven weekday records. Unchecked weekdays close the route for **new** trips. All seven may be closed without archiving the route.
- Specific dates are available for every existing route kind, including weekends. New field trips initially select this mode. An active date-specific route requires at least one date; at most 366 input dates are accepted, deduplicated and sorted.
- Bus, driver, route and trip-pattern readiness and assignment date windows continue to apply. A calendar alone does not assign a bus, driver or students or create a trip automatically.
- Existing routes default to weekly mode and retain saved flags. A legacy route with no weekday rows keeps its previous daily eligibility; its editor shows seven selected weekdays. No existing route is silently closed by a new default. The inspected BusSafe baseline contains two active regular routes, both with seven saved weekday rows, and no field trips.
- Service dates remain calendar dates. Calendar eligibility and new QR trip/dispatch dates use Alberta today, including the permanent UTC-06 rule from March 2026 in the pinned 2026f timezone data. Earlier dates use historical Edmonton rules. No historical trip date is rewritten.
- The insertion guard also covers older internal start paths. It checks active/paused **inserts**, not historical records or resume updates. Parent-route locks coordinate trip creation with the atomic calendar writer.

## Verification and recovery

Tests run against synthetic browser fixtures and embedded PostgreSQL. The database fixture loads inspected hosted function definitions, role helpers and policies; authentication session/JWT inputs are synthetic. It is not a production login test. Coverage includes weekday closures, weekend dates for both route kinds, stale selections, active-trip resume, date boundaries, atomic failure, input bounds, role/scope/session/MFA failures, and installation/recovery.

BusSafe was inspected with read-only, timeout-bounded catalog transactions. On 2026-11-02, the exact pending SQL was compiled in a rollback-only transaction with `check_function_bodies=on`, 5-second statement and 1-second lock timeouts. Function hashes matched the manifest; function owners/ACLs, trigger and constraint matched. Recovery restored the original definitions and removed the new objects inside the transaction. An independent read-only check confirmed the original four modified function hashes and absence of new columns, helper and trigger after rollback. No fixture DML, notification or persistent migration was executed there.

The release manifest is `config/pending/route-service-calendar.json`; migration SQL remains pending. The protected operational release workflow accepts milestone `calendar`. Its preparation checks the exact baseline, rehearses install and recovery, verifies recipient-data digests, and encrypts recovery evidence. Installation requires the reviewed main commit, protected production environment and existing human release requirements. Do not install from this feature branch or replay the migration chain.

Deploy the database change before publishing the web/mobile bundle that selects the new columns and sends calendar keys. Existing clients can continue using the RPC signature. After review and merge, run the protected calendar release, confirm its verification evidence, then publish the corresponding application bundle through the normal workflow. Regenerate hosted types only after installation. Reverse an installed release only with its verified recovery evidence and reviewed handling of any calendars saved since installation; dropping calendar columns loses those newly saved calendars.

The production PostgreSQL timezone upgrade remains a separate protected operational dependency for the rest of the application. This change corrects the affected calendar/start/prepare paths; it does not update the database timezone package or claim to repair every existing server date consumer.

The pre-change security advisor review still reports 12 informational private tables with RLS and no policies, 145 authenticated executable security-definer function warnings, and leaked-password protection disabled. These existing findings remain part of the broader security review; this milestone adds no public security-definer RPC or grant. Advisor remediation references: [private tables with no policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [executable definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

## Manual acceptance after protected release

1. With a synthetic school authority admin at MFA level 2, edit a route and close one weekday. Save, reload and confirm the selection persists. Close all weekdays and confirm its route status stays unchanged.
2. Set a regular route to Specific dates. Add two dates including a Sunday, reject a duplicate, remove one, save and reload. Repeat with a field trip. An active route with no dates must fail without saving anything.
3. Give a synthetic driver otherwise valid bus/driver assignments for the test date. On a closed date, QR options omit the new trip and stale selections fail clearly. On an open date, normal QR start works. Closing the calendar during that active trip must not prevent QR resume or end-trip actions.
4. Verify a transportation admin can read their own authority's calendar but cannot edit a route definition. Verify foreign-authority, guardian, retired school-admin and platform-admin access remains denied. Check missing MFA, expired session and suspended account failures.
5. On Android, verify these start/retry/resume messages and the existing active tracking state using the current bundle. Local build and Android sync do not prove device installation or physical GPS operation.

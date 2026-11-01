# District student roster review — acceptance checklist

**Scope:** Competitor-comparison workflow improvement. **No schema, RPC, SIS import, guardian linking, assignment or other business logic changes.**

## Existing authoritative services retained

- Students list remains fetched using the existing paginated `get_admin_students_page` RPC.
- Server-backed search, school filter and roster-status filter remain tenant-scoped through the existing API.
- Student creation, validated CSV import (dry-run, staging, confirmation and commit), guardian linking and directional bus assignment use existing services and functions unchanged.
- Individual schools are optional data records. No `school_admin` account, role or permission is introduced.

## Read-only review capabilities

1. District operator sees a **Roster review** panel on `/admin/students` with roster-status, optional school and **current-page** review filters. School filter excludes students with no school selected; **All district schools / not assigned** includes them.
2. Every visible roster row has a review status derived from the single bus preview returned by the existing server RPC: **Bus not assigned**, **Check trip details**, **Possible match**, **Bus preview complete**, or **Not active**.
3. Possible match only means exact normalized first name, last name, grade and non-null school ID repeat **on the currently loaded page**. Do **not** auto-merge or mark records as actual duplicates.
4. A bus preview may describe just one currently effective assignment; **Bus preview complete** is not an assertion of full outbound/return coverage, guardian activation or school transportation eligibility.
5. Review filter works only on the current **server page**, not the whole district. Counters say "on this server page", and records on other pages are explicitly not assessed. Server count and pagination remain authoritative and unchanged.
6. All roster rows stay clickable by mouse, Enter and Space to reach the existing student workspace; review state does not add child-row buttons or mutate data.
7. The student workspace presents saved roster status, active guardian link count, and saved bus-route group count plus missing saved stop count. Cards link to existing detail sections. Confirm that the summary uses only already-loaded authorized records.
8. For absent students, status-filtered empty pages, incomplete records and downstream errors, preserve current loading, empty and error behavior.
9. Check that existing student CSV import still stages and validates before an administrator explicitly commits. Never import, merge or edit records from any review flag.
10. Verify no additional RPCs or `public` database writes were added to the roster review and verify RLS/tenant boundaries still enforced by existing services.

## Run

- `pnpm lint`
- `pnpm build`
- `pnpm test`
- `pnpm test:smoke` (commercial browser suite)
- Android build/lint and static security CI

**Manual demo:** Use the current district administrator account, navigate to **Students**, choose Active, optionally a school, and filter the loaded page to "Needs review". Click a student to examine guardian links and transportation directions. Do not treat a flag as a confirmed operational problem until checking the student workspace.

**Deferred scope:** true district-wide server-filtered reconciliation counts, confirmed duplicate detection across pages, SIS delta synchronization, automatic assignment repair and write-side merge logic. These need a separate approved database/RPC milestone.

# Smoke test Supabase mocks

Smoke tests must mock Supabase access explicitly. Auth endpoints and the RPC/table
calls needed by a scenario should be listed in that scenario's Playwright route
handler or in `fixtures/supabase-mock.ts` when shared by multiple smoke specs.

Unexpected `/rest/v1/<table>` access intentionally fails with a loud mock error
instead of returning a broad `[]` fallback. This protects privacy and tenant
isolation by catching accidental direct browser table reads or writes (for
example, reading `student_trip_events` directly instead of using an approved RPC
or security-reviewed service path).

Do not fix smoke failures by adding catch-all empty-array responses for Supabase
REST tables. Add the narrow mock the test legitimately needs, or fix the app code
if the request is an unsafe direct table call.

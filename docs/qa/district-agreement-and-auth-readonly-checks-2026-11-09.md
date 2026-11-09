# SafeBus CR1 — production agreement and authorization read-only checks

**When:** 2026-11-09 (America/Edmonton). **Target:** existing production BusSafe project. **Evidence:** read-only catalog queries and existing versioned SQL test files.  
**Privacy:** no child names, addresses, student rows, GPS, contact details, private contract text, signer IDs, raw JWTs or credentials were exported. No writes, publication or billing changes.

## Results

| Check | Result | Verified boundary |
| --- | --- | --- |
| `tests/rls/commercial-security-existing-database-readonly.sql` | PASS | RLS policy/catalog denial, private notes, malformed or missing session identity, pre-request API session hook |
| `tests/rls/guardian-existing-database-readonly.sql` | PASS (4 assertions) | Anonymous guardian RPC denial and authenticated role without identity denied |
| `tests/rls/admin-trip-reporting-existing-database-readonly.sql` | PASS with 1 skipped role/session case | Platform, available district admin, guardian and driver reporting allow/deny scenarios; one district administrator had no active session |
| Agreement schema/catalog metadata | Installed; **not published** | Five restricted private agreement tables with RLS, 35 guarded transport-write tables, service-only billing gate, public agreement read/sign RPCs, 0 published catalogs, 0 executed receipts |
| Other agreement aggregates | Observed without reading rows | 3 existing authorities; 0 new agreement-required authorities, 1 document-version record, 0 packages |

These SQL scripts are protected by `BEGIN TRANSACTION READ ONLY` and `ROLLBACK`; failure aborts the transaction. They only use bounded role/claim simulations. **They do not prove signed JWT validation, actual tenant A vs tenant B under real authorization tokens, open private Realtime socket revocation or a real Android device journey.**

## Deployment corrections and controls

The original `docs/operations/district-agreement-work1-release.md` predates installation; **do not rerun** the migration just to resolve that stale status. Catalog publication remains 0; clicking acceptance cannot substitute for owner-approved eight-document final terms. Never insert public mailing addresses into source files or unauthenticated pages. Keep temporary Stripe prices and customer subscriptions unchanged while their tax dates/amounts remain under business review.

The current consolidated code changes preserve a canonical, exact Unicode receipt archive and prevent old file-read results from replacing newer platform agreement selections. A missing agreement RPC now produces a configuration error, rather than the misleading “not issued” response. No legal acceptance, live email, supplier approval, MFA plan upgrade, pilot activation, production DDL or physical-device test is claimed.

## Still open

Final signed-session district-isolation tests with consented synthetic accounts, authenticated Realtime revocation and rejoin tests, complete producer/consumer onboarding, insurance, final tax-inclusive per-bus prices, supplier/privacy approvals, final contract publishing and district acceptance, and owner-authorized pilot release. Physical Android and live Resend/FCM tests remain in the final consolidated acceptance phase.

# SafeBus CR1 — Read-only hosted security advisory triage

**Observed:** November 8, 2026 (Alberta); **system:** the connected live `BusSafe` Supabase project.  
**Scope:** advisory metadata and aggregate PostgreSQL catalog counts only. No user table rows, credentials, contacts, student data or GPS were queried. No DDL, grant, RLS, Auth setting, production write or approval was applied.  
**Disposition:** Human/security review still required; **not a completed security acceptance or pilot approval**.

## Hosted advisor groups

| Advisory | Current level/count | Interpretation | Action |
| --- | --- | --- | --- |
| [RLS enabled without policies](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy) | Info — 23 advisor findings | An RLS-enabled table without a policy denies ordinary matching role access; that can be intentional. A separate catalog query found no such tables in `public`; vendor/private schemas must be reviewed according to whether they are exposed. | Inspect each flagged schema/role before changing anything. Do not add a blanket permissive policy. |
| [Authenticated-callable SECURITY DEFINER functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable) | Warning — 162 advisor findings | Read-only catalog query counted 162 such functions in `public`. SafeBus intentionally uses privileged RPCs; an authenticated EXECUTE grant **is not itself proof of exploitation**, but every function must have a documented scope and authorization boundary. | Reconcile each signature against `config/authorization-surface.json`, the inspected migration/source and the protected authorization audit. Confirm tenant/role/session checks, ownership, restricted `search_path`, column/data minimization, and positive/negative tests. Prefer invoker or private schema where safe. |
| [Leaked password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection) | Warning — 1 | Hosted Auth setting reports disabled. This was previously deferred by the owner and remains an open launch/security decision. | Confirm provider/plan support and agree the controlled change before activation; do not mark the warning passed or quietly alter existing logins. |

Aggregate system catalog check also found 16 `auth`, 16 `safebus_private`, 7 `safebus_release` and 9 `storage` RLS-enabled tables without policies; these totals are a **different query population** than the advisor's 23 findings. The SQL did not find any in `public`. Another catalog tally returned 85 authenticated-callable security-definer functions in `safebus_private`, plus provider-managed `extensions` / `net` functions; this does not mean those private functions are automatically exposed through the Data API.

## Acceptance and non-action boundary

1. Existing protected releases and tests already cover specific RPC and RLS boundaries; do not revoke all 162 functions just to clear a broad linter warning.
2. Security acceptance must verify every *actual* callable public RPC with its expected `anon`/`authenticated`/service authorization, a positive permitted scenario and negative cross-district/guardian/driver/revoked-session tests. Historical lint counts are not a replacement.
3. Run further tests only on approved isolated synthetic identities; never seed a production school authority or replay customer records as a QA fixture. Real signed sessions, stale websocket access and installed migration state still require independent acceptance.
4. The owner requested all physical Android and live-provider delivery acceptance at the final consolidated phase; that choice does not bypass the needed security and customer approvals.
5. Neither this review nor the consolidated engineering PR changes `privacy-readiness.json`, `map-readiness.json`, `operations-readiness.json`, `pilot-authorization.json`, Stripe prices or destructive retention.

**Follow-up:** Track each advisor by actual applicability, owner, verified evidence and required protected action. A linter count by itself must not be converted to an approval or a claim of a critical vulnerability.

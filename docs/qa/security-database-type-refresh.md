# Database contract after security reconciliation

The owner-approved installation run
[38665578510](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38665578510)
committed migrations 0123 → 0122 → 0124. Independent read-only verification matched
its complete catalog digest and the 181 public RPCs against the approved allowlist.
The previous generated contract still described 251 public functions and 49
tables, including helpers now private and missing hosted billing/audit functions.

## Authoritative inputs and generation limits

Protected type-refresh run
[38666727598](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38666727598)
successfully generated and pushed commit `1cd76a8`. GitHub's repository setting
blocked its workflow token from creating a PR; that final step failed. No database
write occurred. The feature branch was retained for review through authenticated
repository access, without changing the repository's automation permissions.

The refreshed surface matches all 181 installed public function names and 57
public tables. Independent hosted native type introspection also supplied the
actual PostgreSQL argument-presence/default contract. The first compile revealed
OpenAPI's incomplete nullable-argument metadata and unknown RPC return shapes.

The pure OpenAPI renderer now retains the existing reviewed nullable argument
definitions even when the service-role endpoint advertises those functions.
Required arguments accepting SQL NULL remain required; arguments with defaults
remain optional. Unknown result schemas stay `unknown`. No old public helper is
reintroduced to make compilation pass.

The corrected file was regenerated offline from a metadata model reconstructed
from the protected generated snapshot and independent native introspection.
Rendering that model through the original reviewed generator reproduces the
protected file **byte for byte**, SHA256
`4a7945b8839882c06b4072a75e7ab9cf84ec79319eb4545c0280ef329afad45c`.
The model and proof are restricted owner-local evidence, not application data.
This was not a fresh authenticated OpenAPI capture. After review and merge,
renew the protected canonical generation/check and review any remaining byte diff
before closing the verified-types release gate.

## Runtime boundaries and validation

Callers affected by unknown returns now check the actual response shape:

- Device revocation requires a nonnegative safe integer count; an invalid response
  cannot be presented as successful zero revocations.
- Admin guardian-link results must be arrays with valid fields and the requested
  student and tenant. Invalid or incorrectly scoped results fail before linked
  guardians are fetched.
- QR scan feedback requires one valid result and known trip-status/outcome values;
  malformed feedback cannot be shown as a confirmed event.

These client checks supplement server authorization. They do not replace RLS,
prove actual signed-session/realtime paths or authorize a frontend deployment.
Tests cover required/null/default argument semantics, malformed responses, scope
denial and valid/empty results. `pnpm typecheck`, `pnpm lint`, `pnpm build` and
`pnpm test` passed (382 web + 2 mobile + 322 release/contract tests = 706).
Formatting and `git diff --check` passed. Existing build chunk warnings remain.

Historical adoption, real security acceptance and the final protected canonical
type check remain open. Pending migration 0125 is unchanged and unapplied.

## Subsequent protected verification

After human merge of PR #273, protected run
[38672206649](https://github.com/Davinder498/SafeBus-GLM/actions/runs/38672206649)
completed successfully on `a5e36452a2579a502030eca12da2062d295a4e14` and reported
"Database types are already current." The required fresh canonical byte check
therefore passed. Historical adoption and real security acceptance remain open.

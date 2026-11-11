# Verify the website customers receive

## What failed and what the evidence establishes

Engineering release [42949981147](https://github.com/Davinder498/SafeBus-GLM/actions/runs/42949981147)
attempts 1, 2 and 3 published reviewed main `98c56219bf85ee7f3ed5d0e4d5f0f31f4917232e`,
then failed the same check: 151 of 152 public files matched at the candidate's
Netlify deployment permalink, while `index.html` returned HTTP 200 with different
bytes on all three requests. Each attempt restored deployment
`6af2ed7786e578c4e837f0a9`; the retained rollback records confirm restoration.

The earlier diagnostics/retry repair did not resolve this publication failure.
Do not describe the issue as fixed by retrying or assert a specific Netlify cache,
compression, script-injection or propagation defect without response evidence.

A credential-free [GitHub diagnostic run](https://github.com/Davinder498/SafeBus-GLM/actions/runs/42952465450)
fetched the first two candidate HTML pages from the same runner environment.
All eight requests matched the retained build, including default fetch headers,
identity encoding, cache revalidation and the root URL. The complete original
verifier also passed all 152 files for attempt 2 after restoration. The problem
is not a persistent difference in those uploaded files.

Attempt 3 published candidate `6af3e1073419289145db4df5`. Independent public HTTP
observation during that attempt fetched `https://safebus.kids/index.html` at
03:29:16 UTC on November 11 (21:29:16 Alberta on November 10). Its 962 bytes had
SHA-256 `398e545bc297da492bbe5103fc29c90ac1ebfa869600e17359d4eb216fb0dbbb`, exactly
the retained build. The permalink verifier reported its mismatch at 03:29:28 UTC.
The observer subsequently saw the restored previous HTML with SHA-256
`194fd0e1f573f45186f6ed8e329550663837e5badf64c9084342d5d922e9a7c2`.
A separate [GitHub publication observer](https://github.com/Davinder498/SafeBus-GLM/actions/runs/42952839351)
retains bounded public response evidence without production credentials or writes.
Its completed artifact contains 12 matching observations across both `/` and
`/index.html`, from 03:29:15.212 through 03:29:25.931 UTC, followed by the restored
old HTML. This independently confirms the production/permalink distinction from
a GitHub runner during the failing attempt, not merely after restoration.

This establishes that the actual production webpage matched during the failed
publication window. It does not identify the different bytes received by the
old permalink request, or prove every production asset passed during that window.
The correction below therefore checks every public production file explicitly.

## Correction and acceptance

- Compare every public file with the existing exact SHA-256 build manifest at
  the fixed, reviewed `https://safebus.kids` origin. Check `index.html` at `/`, the
  canonical customer entrypoint. Keep `_headers` and similar provider control
  files excluded from public HTTP comparisons, as before.
- Require the Netlify site, account, production context and candidate deployment
  to match before verification. Recheck the published candidate and delivery
  controls after all byte and public-health checks, before recording success.
- Refuse redirects, wrong bytes, missing files, permanent access denials, site
  changes and concurrent publication/freeze. A failed release still restores
  the previous version only when the candidate remains published and unlocked.
- Preserve four-worker concurrency, the two-minute overall deadline, request
  timeouts and bounded retries. Request cache revalidation. A stale response can
  never pass merely because it returns HTTP 200 or contains the SafeBus name.
- Record the expected/received SHA-256 and byte count on a mismatch, without
  storing response bodies or arbitrary provider messages in release diagnostics.
- Successful evidence names the verified production origin and the before/after
  deployment binding. It does not infer source identity from a deploy title.

Application behavior is unchanged for school authority admins, school-scoped
admins, transportation admins, guardians, drivers and platform admins. Their
permissions, MFA, tenant boundaries, billing and notification choices are not
modified. This repair performs no database writes, real notifications, billing
actions, onboarding fixtures or capacity tests.

## Validation and rollout status

All 23 publisher tests pass, including exact production-byte comparison,
incorrect HTML and asset rejection, concurrent publication/freeze rejection,
bounded retries, credential-safe diagnostics and verified restoration.

A read-only run of the corrected verifier against the restored old production
site correctly rejected the newer build manifest: missing new JavaScript assets
returned the old SPA HTML and failed their exact hashes. This confirms the new
target does not accidentally accept the previous app version.

Repository validation passed: typecheck, lint, production build, all 1,835 tests
(1,213 web, 32 mobile, 590 release), explicit mobile build and Android sync.
The built and synced mobile entrypoints match. Generated PNG encoding-only
changes were restored. This is not an APK/AAB publication or physical-device test.
Protected publication of this correction is still pending. The diagnostic branch
is separate from this repair and its temporary observer workflow must not be merged.

## Netlify usage confirmed during the investigation

The Legacy Free account summary reports 332 of 300 build minutes used, zero
concurrent builds, and a first-of-month usage reset. The project table attributes
410 builds / 329 minutes to `bussafe`, six builds / two minutes to `khasra`, and
one build / one minute to `sparshoverseas`. The aggregate daily chart shows 312
minutes and is inconsistent with the account summary and project table; do not
use that chart to claim a precise total.

SafeBus builds remain stopped. The latest candidate's Netlify deploy detail says
"Building: Skipped", all files already uploaded, 25 functions deployed, and
successful post-processing. These protected attempts built in GitHub and used
`--prod --no-build` to upload; they did not request Netlify cloud builds. They
still consumed GitHub execution time. No plan upgrade, build activation, new
production attempt or additional PR is needed merely to inspect this evidence.

This is a release-verification correction, not commercial-launch approval or
proof of authenticated journeys, notification delivery, Android device behavior
or capacity for 5,000–10,000 buses.

# Hosted artifact verification failure

## Observed release and recovery

Protected engineering release [42944582957](https://github.com/Davinder498/SafeBus-GLM/actions/runs/42944582957)
published candidate `6af3d0ec4216d9236406f05b` from reviewed main
`72037b73d48ab9ecc23d37edaa7673ce2395e311`. The hosted-file check then failed
with `ENGINEERING_RELEASE_HOSTED_ARTIFACT_MISMATCH`.

The retained `rollback.json` confirms restoration of
`6af2ed7786e578c4e837f0a9`. The public homepage was independently fetched and its
SHA-256 matched that previous deployment. This attempt briefly published the
candidate before restoring production. It did not change the database.

Downloaded both retained GitHub artifacts and compared the candidate's immutable
URLs with the original build manifest. All **152 public files** matched exactly,
both with an independent HTTP client and with the original Node verifier.
The public health checks passed on production and on the candidate permalink
(landing page and security headers, login route, map-provider configuration).
These are read-only checks. They do not prove authenticated user journeys,
notification delivery, physical-device behavior or fleet capacity.

The old verifier discarded every HTTP status and network exception and used
the same mismatch error for all failures. The original run therefore cannot
establish whether the first failure was availability, timeout, redirection or
different bytes. A transient hosting/network failure is possible, not proven.
There is no evidence of a persistent uploaded-file mismatch in the subsequent
complete comparison. Do not describe a specific original cause as confirmed.

## Correction

- Preserve exact SHA-256 matching for every public artifact file.
- Keep requests on the immutable deployment host. Inspect redirect status
  without following it. Redirects and permanent access denials stop verification.
- For temporary HTTP failures (404, 408, 425, 429 and 5xx), DNS/network failures
  and timeouts, allow six attempts with 2/5/10/15/20-second backoff. Successful
  files incur no added delay. Different bytes still fail after three attempts.
- Bound the entire comparison to two minutes, each request to at most ten
  seconds and concurrent requests to four. Stop assigning files after a terminal
  failure. Never treat partial verification as success.
- Separate `HOSTED_ARTIFACT_UNAVAILABLE` from `HOSTED_ARTIFACT_MISMATCH` and retain
  the local file path, fixed reason, HTTP status, allowlisted network code,
  attempts and verified/expected counts. At most four active workers can report
  terminal failures. Never retain response bodies, arbitrary exception messages,
  credentials or redirect destinations in these diagnostics.
- Write `hosted-verification-failed.json` before restoration and include the same
  bounded diagnostic in Actions output. Failure to save this evidence must not
  prevent automatic restoration. Successful evidence records the retry count.

This repairs the known diagnostic weakness and improves tolerance of temporary
availability problems. It does not prove the unknown original fault cannot recur.
No release gates, approval requirements, database rules or application behavior
are weakened. No hosting configuration or production content was changed during
this investigation.

## Verification and next release

Regression coverage exercises recovery beyond the former three-attempt limit,
permanent byte mismatch, redirect refusal, access denial, timeout/DNS/HTTP
diagnostics, credential redaction, concurrency and overall time bounds, and
restoration even when diagnostic recording fails.

Local validation passed all 1,832 tests (1,245 application tests and 587 release
tests), including all 20 engineering-publisher tests. Typecheck, lint, web/mobile
production builds, the explicit mobile build and Android sync passed. The synced
Android entrypoint matches the newly built mobile entrypoint. Generated PNG
encoding-only churn was restored and is not part of this repair. This is not
an APK/AAB publication or physical-device test.

The corrected verifier was also run read-only against the original candidate
and original retained manifest: 152 files verified, zero retries. No production
release was started to test this change.

After human merge review, require successful CI for the new exact main commit
and use the existing protected engineering release workflow. Re-running the old
failed job would reuse the old verifier. A new protected release remains needed
to establish successful publication of the corrected workflow.

The current browser-scope policy requires the full suite for release-publisher
changes and for all main commits. This repair does not change that policy. The
direct evidence for this fault is the hosted-file comparison and publisher tests,
not browser smoke coverage.

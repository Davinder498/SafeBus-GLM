# Android paced GPS upload recovery

Status: repository implementation for human review. No hosted load, database
change, deployment, signed-device acceptance or commercial capacity certification.
Customer authorized this milestone after PRs 260 and 261 on 2026-10-12.

## Problem and resulting behavior

The foreground service previously drained its encrypted FIFO in a connected
loop. A failed upload retried only on a later GPS callback or service restart.
Paused/ended trips could therefore strand queued events. A late GPS callback
after pause/end also removed the configuration required for recovery.

`LocationUploadPump` now owns one scheduled task and one upload at a time:

| Situation                                                   | Behavior                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Service start/restart                                       | Random initial delay from 0 to 3 seconds; honor the encrypted persisted retry deadline if later                  |
| Successful FIFO progress                                    | Wait 500–750 milliseconds **after completion** before the next ingestion attempt                                 |
| No validated connectivity                                   | Recheck after 10–15 seconds, without requiring another GPS fix                                                   |
| Network exception, HTTP 408/429/5xx, unknown acknowledgment | Exponential retry: initially 2–2.5 seconds, local maximum 120 seconds, randomized per attempt                    |
| Valid `Retry-After`                                         | Honor integer seconds and HTTP-date forms plus 0–3 seconds jitter; server floors may exceed the local maximum    |
| Token refresh fails temporarily                             | Use the same retry policy; retain the FIFO head and credentials                                                  |
| Token refresh succeeds                                      | Save tokens while preserving current pause/end state; retry ingestion as a separate paced attempt                |
| Permanent HTTP denial                                       | Stop collection and the foreground service; retain the unacknowledged encrypted queue for investigation/recovery |
| Pause/end                                                   | Stop collection; retry pending entries independently until drained, permanently denied or authorization expires  |
| Authorization expiry/missing configuration                  | Stop before another ingestion or refresh; retain queued ciphertext                                               |
| Service destruction                                         | Cancel scheduled work and shut down the single worker; no new retries from the destroyed service                 |

Repeated GPS/resume signals cannot bypass a retry deadline or enqueue additional
upload jobs. An empty active queue gets an expiry timer; new fixes replace that
timer while retaining the minimum pacing deadline. Cancellation generations
reject callbacks already dequeued by the scheduler.

The healthy gap bounds one device to at most two ingestion attempts per second,
before HTTP latency. This is a **per-device limit**, not a fleet admission limit:
10,000 devices could still offer up to 20,000 attempts/second. Randomization does
not replace server admission control or establish a five-minute fleet recovery
guarantee. FIFO recovery can delay fresh map positions behind history; existing
server stale-fix rules still apply. These remain subjects for the broader scaling
and real-device acceptance milestones.

## Data and authorization

The collector remains at three seconds. Pause/end never collects additional
locations. Event UUIDs, monotonic sequences, encrypted SQLite storage, payload
shape and existing RPC authorization are preserved. The scheduler never removes
a queue entry: the service advances only on the existing accepted/permitted
rejection response. Transport failures and unknown/malformed responses preserve
the head for another attempt with the same identity.

Retry deadlines are encrypted in the existing Keystore-backed preferences so a
service restart does not ignore a server wait. Failed protected-state writes now
raise an error rather than reporting a successful commit. A persistence failure
retains the in-memory wait; its persistence across a process crash cannot be
guaranteed. Local exponential failure counts reset after process restart.

Responses have a 64-Ki-character limit, connection/read timeouts remain enabled,
and connections are disconnected in `finally`. HTTP redirects are refused.
Retryable statuses do not require an error body, preserving `Retry-After` even
with an empty/broken response body. Fixed-length streaming prevents implicit
buffered POST replay by the transport. No credentials, payloads or raw locations are
logged. No API keys, SQL grants, functions or RLS policies change.

## Validation

```powershell
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm --filter @safebus/mobile cap:sync
cd apps/mobile/android
./gradlew.bat testDebugUnitTest assembleDebug lintDebug --console=plain
```

The JVM tests execute the production pump under virtual time with synthetic
FIFO/transport/persistence ports. They cover pacing, startup jitter, repeated
wake signals, single-flight behavior, exponential backoff/reset/cap, server wait,
offline recovery without GPS callbacks, restart with the same event identities,
expiry, permanent denial, cancellation races, late idle-transition fixes and
persistence failure. HTTP-policy tests cover retryable status classification and
valid/malformed/overflowing `Retry-After` values. Existing CI runs the native tests,
Android packaging and lint.

Real loopback HTTP tests use synthetic headers and bodies to exercise successful
UTF-8 POSTs, empty 429/truncated 503 responses, bearer-free refresh denial,
redirect refusal, oversized success bodies and read timeouts. The fixture binds
only `127.0.0.1` and terminates its single worker/listener after each test.

These are not physical Keystore/SQLite crash tests, actual Supabase token/RLS
acceptance, Android foreground-service lifecycle certification or fleet load
evidence. On a separately approved target and signed device, verify network
loss/restoration after pause/end, kill/reopen/reboot (force-stop requires owner
reopen), 429/503 and refresh faults, clock changes, permissions/battery controls,
queue encryption and event UUID reconciliation. Record achieved fleet arrival
rates, fresh-fix age, fairness and recovery time before claiming capacity.

The deferred migrations and backup restore verification remain launch blockers.

Local validation on 2026-10-12: `pnpm typecheck`, `pnpm lint`, `pnpm build` and
`pnpm test` passed (335 web, 2 mobile and 245 release/contract tests). Native
`testDebugUnitTest assembleDebug lintDebug` passed with 32 JVM tests (30 new),
including eight real loopback HTTP cases. Migration checksums passed for all 125
immutable files. Existing Gradle/Capacitor warnings remain; no signed device or
hosted capacity result is inferred from these checks.

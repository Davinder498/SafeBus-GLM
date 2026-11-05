# Approved end-to-end retention expansion — 5 November 2026

The owner approved the remaining retention/disposal schedule and automatic
execution, including school authority and platform administration. This expands
PR 388. Human merge, protected release, recovery and acceptance requirements
remain.

## Policy and authorization

| Class | Automatic method and trigger |
| --- | --- |
| Invitations | Delete 90 days after terminal/expiry activity; never delete a live invitation |
| Students | Delete 395 days inactive, after related records independently qualify |
| Guardian relationships | Delete 395 days after relationship inactivity, revocation, expiry or the student's inactivity; the latest relevant change wins |
| Drivers | Remove operational personal details 395 days inactive; protect required trip/hold dependencies. Auth account erasure is a separate explicit instruction |
| Tracking credentials | Delete 30 days after end/revocation/expiry; never export credential hashes |
| Dispatches and trips | Delete 395 days after terminal state, after child records/holds permit |
| GPS, events, inbox and delivery | Approved 30/395/90-day rules from the initial implementation |
| Audit | Remove identifying fields after 730 days, preserving scoped holds; do not call remaining action/time data anonymous |
| Abuse buckets | Delete 2 days after the counter window |
| Session mirrors | Delete after 90 days revoked/closed only when canonical Auth sessions are absent/expired; deletion must not revive a revoked session |
| Inquiries | Dispose 90 days after resolution, unless a continuing relationship or hold requires retention |
| Ordinary support | Dispose 365 days after resolution; privacy/incidents are separate cases |
| Ordinary finance | Six calendar years after the relevant corporate fiscal year end, extended for late filing and exceptions; historical corporate/property records are not automatically deleted |
| Personnel/privacy/incident/legal cases | A documented case-specific minimum and review are required; no universal period is invented |
| Supplier copies/logs | Use verified provider capabilities/windows and completion receipts; database deletion is not provider deletion |
| Owner-controlled exports/recovery copies | Rolling 30 days, excluding active preservation and required key custody; provider immutable windows remain separately recorded |
| Native queued locations | Purge after the authorized delivery window when the app resumes execution; unreadable legacy ciphertext is preserved for recovery |

School authority admins manage their authority's operational records and scoped
holds/downloads. Transportation admins retain their operational scope; security
and account exports are not added to that role. Retired school admins, guardians
and drivers receive no bulk export privilege. Platform admins manage SafeBus
business/security records and aggregate execution evidence. A platform request
for customer transport exports needs scoped authority approval. MFA and recent
sign-in protect changes and downloads. No platform-wide transport browse is added.

Preservation requests take effect before automatic disposal; review never
releases them. Decision use adds a calendar-year minimum. Class/record/date scope,
reference, requester and release are audited. Exports are bounded encrypted
chunks, not bearer URLs, and exclude credentials. Export generation protects its
source rows until completion/expiry; an export does not silently cancel a legal
hold. Downloaded customer copies are the customer's responsibility.

Business records are classified by an authorized operator, with resolution dates,
fiscal year/late filing or case-specific minimums. An inbox received date is not
assumed to be case closure. Provider-managed records stay visibly outstanding
until the actual provider disposal or verified expiry is confirmed. Unsupported
provider access is a concrete integration dependency, not a false completion.

## Technical acceptance

Verify each role and tenant boundary, cutoff dates and calendar years, no session
revival, all parent cascades, hold/export races, retries/partial outcomes, archive
integrity/removal, identifier minimization, alerts and recovery. Do not execute
fixture notifications, payments or blanket destructive tests in production.
Record hosted and provider acceptance separately from local test results.


Use **Records & disposal** in school authority settings or the platform sidebar.
Register actual business copies and their resolution dates or applicable fiscal
period. Approved exports are prepared in encrypted 200-record chunks. Platform
requests for authority records require approval by an administrator of that
authority. Server export copies expire 30 days from approval.

The scheduled function reports dry-run eligibility and hands work to a leased
background worker. Configure the dedicated archive key and
`SAFEBUS_RETENTION_WORKER_TOKEN` in production functions before acceptance.
Export generation can run while destructive execution is paused. Automatic
disposal requires both the production execution setting and protected database
approval. Retain encrypted recovery and run the installed read-only eligibility
check before activation.

The mailbox connection and actual fiscal year-end were unconfirmed when this
candidate was prepared. The register requires each ordinary financial record’s
actual relevant fiscal year-end. Mailbox and supplier copies remain visible as
provider work until a disposal receipt or verified expiry is recorded. Existing
copies outside SafeBus need to be registered and reconciled. Native queue expiry
uses the 24-hour server admission window and requires physical-device acceptance.

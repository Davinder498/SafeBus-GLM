# Point 7 — Android Reliability and Distribution Readiness

**Status: Repository evidence gate implemented; Point 7 remains open.**

Commercial Readiness Point 7 requires a source-bound signed Android bundle,
representative physical-device evidence, Google Play background-location
acceptance, customer BYOD controls, and accountable human approval. A green
Android CI build or a signed test artifact does not close this gate.

## Repository controls

The protected `Build signed Android release` workflow checks out an exact
40-character reviewed commit, builds and tests the release application bundle,
verifies its JAR signature, extracts the public signing-certificate SHA-256
fingerprint, and uploads both:

- `app-release.aab`; and
- `safebus-android-provenance.json`.

The provenance record binds the artifact digest, signing-certificate digest,
application ID, version, exact source commit, release-controlled source digest,
and GitHub workflow run. It contains no signing key, password, application
credential, test-account credential, customer information, or driver data.

`docs/governance/android-readiness.json` is the machine-readable Point 7
approval record. `pnpm android:readiness:verify` fails closed unless all of the
following are current and bound to unchanged release-controlled source:

- the signed bundle provenance;
- the approved 20-percentage-point battery, 25 MB data, zero-loss, and
  15-minute recovery ceilings;
- measured eight-hour results with zero off-trip location rows;
- passed evidence for at least three distinct manufacturer/device classes;
- every field, lifecycle, offline, role, BYOD, and authorization scenario in
  the Phase 7 acceptance plan;
- Google Play background-location declaration, review video, Data safety form,
  non-secret test-account reference, and public privacy-policy evidence;
- customer BYOD, support/reimbursement, lost-device, and driver-notice
  controls; and
- Platform Administrator, Product, Security, Privacy, Operations, QA, and
  driver-representative approvals.

An approval expires after at most 90 days. Any change to the Android app,
native code, relevant web permission flow, database authorization contract,
release workflow, verifier, or release tests changes the digest and invalidates
the record.

## Current authorization state

The committed record is deliberately `not_approved`, with empty device,
physical-test, Google Play, customer-policy, artifact, and approval evidence.
Merging the repository gate does not approve Android production use, Google
Play publication, or driver participation.

Generate the digest only after every test candidate is finalized:

```bash
pnpm android:readiness:digest
```

Activation requires a dedicated reviewed pull request that copies only
non-secret evidence references and provenance values into the JSON record.
Executed contracts, screenshots containing account details, test credentials,
driver names, routes, raw locations, and personal-device identifiers stay in
the approved restricted evidence system—not in Git.

## Physical and hosted-test boundary

Follow [`../phase-7-production-driver-tracking.md`](../phase-7-production-driver-tracking.md)
for the device matrix and pass conditions. The sole hosted Supabase project is
production. Do not run the forgery/cross-driver RLS suite, create test drivers,
write synthetic trips, or perform destructive recovery testing there. That
scenario remains open until an explicitly approved isolated database is
available.

The other physical scenarios require supported personal Android phones and
synthetic, non-production accounts on an approved target. Repository tests do
not substitute for road, battery, reboot, offline, vendor-optimization, or
eight-hour evidence.

## Exit record

| Evidence                                | Current state                            | Owner                       |
| --------------------------------------- | ---------------------------------------- | --------------------------- |
| Exact-commit signed AAB and provenance  | Pending protected workflow execution     | Engineering / Release owner |
| Three-class device matrix               | Pending physical execution               | QA Lead                     |
| Eight-hour battery/data/off-trip result | Pending physical execution               | QA / Operations             |
| Offline zero-loss reconciliation        | Pending physical execution               | QA / Engineering            |
| Isolated authorization/forgery suite    | Blocked by no approved isolated database | Security Lead               |
| Google Play package                     | Pending Play review                      | Product / Privacy           |
| Customer BYOD operating controls        | Pending customer approval                | Customer authority          |
| Final Point 7 approvals                 | Pending                                  | Named approval roles        |

Point 7 closes only when the committed readiness record passes
`pnpm android:readiness:verify` and its dedicated activation pull request is
human-approved. Approval is evidence of the tested Android release only; it
does not authorize the broader Commercial Release 1 pilot.

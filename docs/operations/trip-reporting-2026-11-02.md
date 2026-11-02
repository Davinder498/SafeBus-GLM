# Read-only trip reporting and privileged MFA release

All trips adds Trip history, Driver exceptions and Dispatch flags. Date/status
filters and exact counts execute before bounded pagination. Exceptions are
individual records; dispatch flags are the latest saved flag, not a complete
status timeline. Historical planned departure/arrival snapshots are absent.
Current schedules, recorded trip timestamps and student events remain distinct.
There is no lateness calculation, inferred missed trip, substitution inference,
GPS history exposure, new notification, or new database endpoint.

## Acceptance by role

| Role                        | Expected behavior                                                              |
| --------------------------- | ------------------------------------------------------------------------------ |
| School authority admin      | Own authority reports with active session and MFA; no cross-authority records. |
| Transportation admin        | Same reporting reads within the existing authority scope.                      |
| Retired school-scoped admin | Reporting remains unavailable; no role reactivation or promotion.              |
| Guardian                    | No admin reporting; existing linked-student workflows and optional MFA remain. |
| Driver                      | No admin reporting; own-trip workflows and optional MFA remain.                |
| Platform admin              | Administrator MFA remains mandatory; no authority reporting access is added.   |

The new client checks active profile, role and AAL, then calls the existing trip
detail RPC with the nil UUID to verify authority/session/MFA server-side before
reading evidence. The nil UUID was confirmed absent on BusSafe. All evidence
reads use caller RLS, explicit authority predicates and inner authorized-trip
joins. Access failures clear results. Superseded requests are aborted/ignored.

## Security correction and evidence

The hosted `has_completed_optional_mfa()` exempted privileged administrators at
AAL1 because its enrollment lookup only considered guardians/drivers. The API
pre-request hook and restrictive RLS policy both used that helper. The trip RPCs
had their own stricter MFA checks. This is an existing table/API MFA gap, not a
complete authorization audit or proof of an incident.

The owner approved including the narrow correction on 2026-11-02. The pending
migration changes this helper and the API hook: privileged roles cannot use the
recipient enrollment exemption. Password-policy validation and own invitation
activation retain POST-only bootstrap access before MFA, with their existing
invitation/ownership checks. It retains guardian/driver enrollment semantics,
sessions, account boundaries and grants. It does not
update profiles, factor enrollment, recipient choices or notification records.

`config/pending/privileged-admin-mfa.json` binds the SQL digest, exact hosted
baseline/after hashes, owners and ACLs for two changed functions and three unchanged
dependencies. The hosted baseline definitions are retained in the synthetic-test
fixture. The existing protected operational workflow now has milestone `reporting`.

Hosted verification on 2026-11-02:

- Read-only existing-identity checks passed for two authority-admin contexts,
  one driver and one guardian. Another authority admin and the platform admin
  lacked active sessions and were skipped. No transportation-admin or legacy
  school-admin identity was available. These omissions are not claimed as passes.
- The RPC rejected AAL1 admins and non-reporting roles; authority RLS checks passed.
- The pending functions compiled with body checking inside one bounded transaction,
  with an eight-second statement timeout, one-second lock timeout and ROLLBACK.
- The rehearsed helper hash was `f2169c0652e9c6b9284c1b366f38611d`.
- A subsequent independent read-only transaction verified restoration of all five
  original function hashes, including helper `993c7430149d80d7b5ed93be04a9fb55`.
- A second bounded rehearsal verified admin AAL1 API rejection, the POST-only
  invitation bootstrap and subsequent restoration. Helper checks also confirmed
  three existing authority admins and one platform admin require AAL2, while the
  two existing recipient identities retain their previous optional-MFA result.
- Embedded PostgreSQL tests exercise real invitation activation/rejection, all roles, MFA enrollment, tenant boundaries,
  session/account failures, exact manifest rehearsal, ACLs and dynamic restoration.

This is rehearsal evidence. The correction is **not persistently installed**.
Production still has the existing MFA gap until the protected installation runs.

## Protected release and recovery

After human review and merge, run **Release operational fix** on the exact reviewed
current main SHA, milestone `reporting`, mode `rehearse`, confirmation
`REHEARSE_OPERATIONAL_FIX`. Then use its protected `install` mode with
`INSTALL_OPERATIONAL_FIX`. The workflow verifies target/drift, captures encrypted
bounded recovery, uploads recovery before installation, checks recipient-data
stability, rehearses restoration and verifies installed definitions/ACLs. Use the
captured restoration SQL through the same reviewed production process if recovery
is required. Never replay the migration chain or apply this pending file directly.

Release the matching web artifact through the existing protected workflow.
No production deployment or merge is part of this implementation task.

BusSafe reports Postgres service version 17.6.1.155. Supabase identifies it as
affected by outdated Edmonton tzdata. Schedule a separately protected service
upgrade and verify local date generation; do not rewrite historical service dates
in this change. Reporting uses pinned moment-timezone 0.6.6, with only its IANA
2026f Edmonton zone bundled, independent of browser/OS timezone updates.

## Manual acceptance after release

1. Sign in as each permitted admin with MFA. Open All trips and compare a known
   recorded trip's service date, actual timestamps, bus and recorded driver.
2. Open Driver exceptions. Apply service dates, trip status and category. Change
   page/size, open a trip, return, and confirm the report/filter/page is restored.
3. Open Dispatch flags and filter marked late/missing. Confirm only saved flags
   appear, with their reason/time and the latest-record disclosure.
4. In detail, confirm planned start/end are unavailable, stop schedules are current
   definitions, and actual stop arrivals are not inferred from GPS or student events.
5. Verify overnight dates and offsets, including 2025 repeated DST hours and
   November 2026 UTC-06:00. Test empty, failed, retry and revoked-access states.
6. Verify another authority cannot read the records. Confirm denied roles cannot
   enter reporting; reject admin AAL1 at the API and table RLS after installation.
7. Confirm unenrolled guardians/drivers retain normal features, enrolled recipients
   require MFA, and administrator MFA/bootstrap still work. Send no QA notifications.

Reliable historical planned-versus-actual comparisons remain unavailable. After
this milestone is reviewed and merged, the next work is the rural-operations gap
assessment, not an automatic rural-module implementation.

# Hosted notification migration reconciliation

Read-only inspection of production-designated BusSafe (`ckrkfylsyihwouvesypm`)
at 2026-10-27 21:34 UTC confirmed the following. Queries used a read-only
transaction, five-second statement and one-second lock timeouts, and final
rollback. No records, policies, devices or queues were changed and no notifications
were sent.

| Prepared change                                         | Actual hosted state                                                                                                                                                                                                                                                                                       | Required action                                                                                                      |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `20261026171535_recipient_notification_delivery.sql`    | Its delivery behavior is incorporated in the later complete-recipient change already present in BusSafe.                                                                                                                                                                                                  | Do not apply this superseded file after the complete-recipient change.                                               |
| `20261026212046_complete_recipient_push_delivery.sql`   | All ten reviewed final function definitions match exactly after normalizing line endings and the final terminator. Anonymous/authenticated execution remains closed for those functions. All six delivery/preference tables retain RLS; legacy switches, mutation RPCs and old function gates are absent. | Verify the installed state through the existing protected workflow; do not replay the old-baseline migration.        |
| `20261026194051_announcement_guardian_school_scope.sql` | The installed `announcement_recipients(uuid,uuid,text,uuid)` definition exactly matches the reviewed forward definition.                                                                                                                                                                                  | No further audience helper replacement is needed.                                                                    |
| `20261027120000_notification_templates.sql`             | The three new copy helpers are absent and the nine original function hashes still match the pending baseline. The template change is not installed.                                                                                                                                                       | Correct the MFA dependency, review the correction, then rehearse/install through **Release notification templates**. |

## Cause of the reported errors

The delivery and announcement files are guarded forward changes. Their baseline
errors are expected when the desired newer definitions are already installed;
they do not establish that those features are absent. The older recipient file
and its replacement must not be installed sequentially. Do not remove the guards,
replay the historical chain, re-add retired authority switches, or invent migration
history entries to make an already-installed state resemble the old baseline.

The template failure is a real migration defect. It referenced
`public.has_verified_mfa()`, which was moved into `safebus_private` by the existing
security reconciliation. The live function is
`safebus_private.has_verified_mfa()`. The corrected migration calls that private
helper and explicitly checks all three authentication dependencies before any
function replacement. It does not add a public alias or weaken administrator MFA.

The former local fixture also defined the obsolete public helper and left
`check_function_bodies=false` enabled after historical bootstrap. The corrected
fixture uses the private layout, omits the public helper, and enables body checking
before compiling the actual forward SQL. Regression tests cover successful
compilation in that layout and early rejection of a genuinely missing dependency.
The protected release preflight now checks those same dependencies explicitly.
Both the hosted rollback rehearsal and atomic installation explicitly enable
function-body checking as well; a connection with deferred checking cannot mask
a missing SQL-function dependency.

## Installation and recovery

PR #323 was human-merged as `e08a3519805b0bc94364ca94ed5bf1fd33f81c25`.
The MFA correction needs its own reviewed commit on main before release. Use the
corrected `config/pending/notification-templates.json` digest and the existing
**Release notification templates** workflow, rather than pasting four pending SQL
files into the SQL editor.

That workflow binds the exact reviewed main SHA to BusSafe, verifies prerequisites,
rehearses the bounded change with rollback, checks independent restoration, retains
encrypted recovery before persistent changes, validates Firebase without delivery,
installs atomically and compares installed definitions/ACLs/trigger order. The
existing production environment requires a human deployment reviewer and prevents
self-review; this correction does not remove or bypass that protection.

This read-only reconciliation is evidence of the already-installed recipient and
announcement behavior. It is not a template deployment, an executed rollback, a
pre-change backup, or proof of actual phone display. Record the protected release
run and its verification outcome here after the corrected commit is approved and
released.

# Notification privacy approval — 2026-10-24

The SafeBus owner explicitly approved notification privacy in this session:

> i approve privacy.

This records the owner's approval for the school-authority notification setup
being discussed. It does not grant consent on behalf of guardians or drivers.

## Verified current state

The open SafeBus session displays **Test School Admin**. Read-only checks against
the existing BusSafe production project (`ckrkfylsyihwouvesypm`) confirm that this
active school authority admin belongs to **Test School District**
(`a7033cbe-9bc7-4508-89bd-0a19270a2c15`). Its notification policy currently has:

- `privacy_review_status = 'pending'`
- `privacy_approved_at = NULL`
- `notifications_enabled = false`
- `push_notifications_enabled = false`
- `push_delivery_preference_enabled = false`

These saved values explain the previous “External delivery is locked” banner.
This is an application configuration gate, not a claim that the owner has not
given approval in this conversation.

Verification used `BEGIN TRANSACTION READ ONLY`, transaction-local 5-second
statement and 1-second lock timeouts, and final `ROLLBACK`. No notification
settings, recipients, preferences, queues, or identities were changed. The only
non-internal update trigger on the policy table sets `updated_at`.

## Protected recording step

The reviewable production change is to record this approval on **only this
policy**: set `privacy_review_status` to `approved`, record the actual approval
timestamp, and bind `privacy_approved_by` to an authenticated, verified approving
profile. Preserve all delivery switches, limits, individual choices, other school
authorities, and existing queue records. Approval alone must not send alerts.

After recording approval, verify the school authority's settings RPC reports
approval and that email and push remain off. The school authority admin can then
choose to resume alerts through the existing authenticated, audited controls.
Do not simulate an authenticated actor or bypass the protected workflow.

**Live approval recording remains pending.** `AGENTS.md` requires:
“Modify production only through the protected, approved adoption/release
workflow.” This UI pull request does not execute that production operation or
merge itself. The scoped notification approval is recorded here; no additional
owner privacy confirmation is being requested.

The separate commercial privacy-readiness evidence file is unchanged because
this request addresses notification setup, not completion of its legal,
supplier, retention, and contract evidence.

# Bounded legacy notification availability repair

The standard notification privacy setup was already approved by the owner. New
accounts use approved defaults, but the authority identified in
`config/pending/legacy-notification-defaults.json` retains an untouched pending
policy. Read-only observation on November 14 confirmed an active account,
no approval identity/date, and the unchanged October 29 policy state. This is
not a new approval requirement for the authority.

The repair changes only its privacy status and records the reviewed approval
time. It does not impersonate an administrator (`privacy_approved_by` remains
null), alter quotas, change recipient opt-outs or create delivery work. Every
policy field and the account's status/creation time must match the reviewed
baseline. Rejected policies, changed quotas, another authority, a missing row or
an unexpected trigger cause failure. Existing trigger definitions and grants
are pinned in the release manifest.

## Acceptance by role

- School authority and transportation admins retain their existing scope and MFA
  requirements. Normal notification availability no longer fails solely because
  this old account has a pending default.
- Guardians and drivers keep their own opt-outs, quiet hours, device permissions,
  assignments and account controls. No recipient is subscribed by this repair.
- Platform admins gain no access to customer records or recipient preferences.
- The retired school-scoped admin role gains no access.
- The release sends no test notification. Local database fixtures verify changed
  state, refused drift, other-authority isolation and restoration; provider/device
  acceptance remains separate.

## Protected rollout

Use the existing **Release operational fix** workflow, milestone
`notification_defaults`, exact reviewed main SHA, mode `install`, confirmation
`INSTALL_OPERATIONAL_FIX`. Its prepare step rehearses and restores the change in
one rolled-back transaction, checks recipient-data digests, and retains encrypted
recovery before committing. A separate rehearse run is optional, not a required
extra build. An already installed matching state is verified without reapplying.

Recovery restores only the prior pending status/null approval date and refuses
later business-field changes. The normal `updated_at` trigger records recovery
as a new update; recovery deliberately does not falsify that audit timestamp.
Recovery cannot retract messages independently delivered after activation.
No schema, grant, RLS, generated type or historical migration changes are made.

## Related launch evidence

Billing PR 447 was published by run 43570971707. The live Stripe endpoint now
has all 26 reviewed event subscriptions. The owner deferred billing end-to-end
and mailbox acceptance, and leaked-password protection remains deferred.

November 14 read-only retention evaluation returned 2 eligible invitations,
11 tracking sessions and 138 rate-limit buckets; all other classes returned zero.
The destructive control remains false. This repair does not activate retention
or prove scheduled deletion, Auth disposal, operational alert receipt, real-device
acceptance or 5,000–10,000-bus capacity. Retention requires its own reviewed control
activation and observation of the first bounded scheduled execution.

Live Netlify inspection confirmed successful minute-by-minute dry runs with the
same counts, no saturation, and no pending Auth account disposal. The execution
flag is absent; application monitoring remains `observe`. Activation requires
retaining recovery of the records to be removed, not merely saving a copy of the
control switch. No destructive switch was changed during this inspection.

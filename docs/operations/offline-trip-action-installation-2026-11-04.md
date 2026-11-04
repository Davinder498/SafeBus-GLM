# Offline trip-action installation and inventory adoption

Acceptance before inventory adoption: active drivers may use only their own trip
retry endpoint under the existing session, authority, account and enrolled MFA
guards. School authority admins, school-scoped admins, transportation admins,
guardians and platform admins gain no driver-replay access. Their permitted
events, channels and scope remain unchanged. Anonymous and service-role execution
of the new endpoint remain denied. Audit failures must still fail visibly.

The protected [offline_actions release](https://github.com/Davinder498/SafeBus-GLM/actions/runs/41866277317)
completed on reviewed main `630ae69b60382c71b43a640a3d6cb6d3f81ef63e`.
It reconciled the hosted schema, rehearsed installation/restoration with rollback,
retained encrypted bounded recovery before installation, and verified the result.
The retained recovery ciphertext digest and release bindings were checked locally.
This establishes recovery for this bounded change; it does not establish a full
database, Storage or provider-secret restore.

A separate read-only catalog check confirmed the exact installed definition,
postgres ownership, authenticated-only execution and all eight unchanged guards.
All 219 previously inventoried public application functions retain their recorded
ownership, ACLs and available definition fingerprints. The sole addition brings
the catalog to 220 functions, with no anonymous application execution grants.

This source change adopts that verified endpoint into the active authorization
inventory. It changes no live grants or role checks. The previous launch-inventory
observation stays unchanged; a separate observed overlay retains the new proof.
The migration file remains at its reviewed historical source path and must not
be replayed. The full protected authorization audit follows review/merge of this
inventory update.

No real trip stop, announcement or external notification was executed as QA.
The live definition/grant verification is not physical-device acceptance or proof
of source-event delivery. Signed-candidate restart/airplane-mode/device acceptance
and the remaining launch gates are still required.

# Live API inventory reconciliation

Acceptance defined before implementation: the audit must compare every live
application RPC with an explicit audience, without granting permissions to make
the audit pass. Authenticated execution does not authorize every signed-in role:
existing role, tenant, ownership, session and MFA guards remain in place.

School authority administrators retain only their authority operations; supported
scoped administrators retain school restrictions. Guardians retain linked-student
access and own preferences; drivers retain own-trip and own-preference access.
Platform endpoints retain platform-admin/MFA restrictions. No retired role gains
access; recipient delivery choices and notification channels remain unchanged.
Unexpected endpoints or grant drift must still fail the audit.

The reconciliation records read-only catalog observations, not proof that prior
installations had recovery evidence. No DDL or grants are issued by this change.

Fresh read-only comparison: 219 application functions, zero inventory differences,
zero authenticated-grant differences, zero service-role-grant differences, and
zero anonymously executable application functions. Added 23 authenticated and
17 service-only endpoints to the inventory. Seventeen authenticated endpoints
explicitly deny service-role execution, including the three previously known QR
and support-contact grant differences. This records existing least-privilege
choices; no blanket grant is appropriate.

Reviewed endpoint groups: QR printing and seat assignment retain authority and
entity guards; capacity delegates scoped service reads; admin trip operations
retain session/MFA and authority/school scope; announcements use the active-admin
helper and recipient scoping; driver preferences require an active own driver and
completed enrolled MFA; guardian stops require active, unexpired linked access;
authority onboarding requires active platform MFA/recent authentication; billing
and delivery workers remain service-only. The associated prepared migrations
remain historical source locations, not instructions to replay them.

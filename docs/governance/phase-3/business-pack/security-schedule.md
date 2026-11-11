# SafeBus Security Schedule — Draft

**Status:** Proposed operating obligations; evidence acceptance remains open

## Safeguards to be accepted before operation

SafeBus and the Customer use safeguards proportionate to minors' identity,
driver information and active-trip location. The accepted service must include:

- HTTPS/TLS for transport and verified provider connections; vendor evidence
  for stored database/backup encryption and protected recovery-key ownership.
- Tenant, school, assignment and guardian-link authorization, enforced at
  database/API boundaries and independently verified with allow/deny cases.
- Administrator MFA/recent authentication for sensitive work, account lifecycle
  controls and verified session/device revocation, including realtime and Android.
- Server-restricted privileged credentials, no frontend service secrets,
  controlled personnel access and appropriate access review.
- Sanitized audit evidence, secure logging, reviewed dependencies and protected
  feature-branch releases with human approval and rollback authority.
- Device controls appropriate for personal Android phones, an encrypted offline
  queue, active-trip-only collection, disclosed recovery limits and lost-device
  handling. Do not collect new locations during paused/ended collection.
- Approved retention and legal holds, supplier
  oversight, routed monitoring/incident contacts and tested response procedures.

The Customer supplies current assignments, guardian authority, trained users,
prompt joiner/leaver updates, supported devices and a BYOD policy. Users protect
their credentials, report lost devices and do not circumvent controls. SafeBus
assists within agreed boundaries; a business owner role does not grant permission
to browse the transport data of all tenants.

## Personnel assisting with setup

Setup assistance is included with the subscription. Guidance and walkthroughs
need not involve access to Customer records. When the authority authorizes
configuration help requiring access, use individual scoped accounts, existing
permissions, administrator MFA and reviewed access records. Keep platform
administration separate from customer record work; do not share credentials or
bypass RLS. Follow the [setup-assistance checklist](../../../operations/managed-onboarding.md)
for necessary source transfer, validation and access review/removal. Preparing the
checklist does not prove access or a transfer channel has been provisioned/tested.
Continued assistance requires current authorization and an agreed purpose.

## Current evidence, not certification

| Control                                     | Repository evidence                                                                | Acceptance still needed                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Scoped access and revoked-session hardening | Reviewed migrations 0122–0124 and application boundary work                        | Installation verified; real signed-session, REST/RPC, cross-school/tenant and realtime acceptance |
| Android protected queue and paced recovery  | Native encryption/pacing implementation and local tests                            | Signed physical-device, offline, pause/end, lost-device and battery/recovery evidence             |
| Guardian fail-closed refresh                | Client coordination and local browser checks                                       | Hosted authorization/revocation and provider/device behavior                                      |
| Retention and audit minimization            | Migration 0069 and scheduler draft controls                                        | Approved periods, safe enforcement and hold handling evidence                                     |
| Recovery (outside launch scope)             | Historical encrypted export/full-restore and rollback evidence retained separately | No new recovery exercise is required for launch; no RPO/RTO promise is made                       |
| Alerts, providers and capacity              | Engineering gates and planning model                                               | Staffed routing, paid plans/quotas, observation and measured supported load                       |

This schedule does not represent these pending items as passed. Source tests,
security advisors or a supplier's paid plan do not independently prove the full
service. Do not begin real customer processing until the appropriate acceptance
conditions in the Order Form and release gates pass.

## Customer-specific security acceptance

Before activation, record the Customer's information classification, safeguards
and privacy-program requirements against the implemented controls above. Identify
any gap and agreed treatment explicitly; no blanket claim that every Customer's
policy is already met is made. Record the security threat/risk assessment interval,
responsible reviewer and Customer-requested review procedure in the accepted
schedule. Preserve necessary audit trails under category-specific periods and
holds sufficient for applicable Customer and regulator investigations.

Provide access/training evidence and assessment findings securely under DPA
sections 3.1 and 6.1. Keep detailed infrastructure and other-customer records
restricted. Annual personnel privacy refreshes and corresponding supplier evidence
are obligations to fulfill, not certifications conferred by this document.

## Operational evidence and change

Maintain controlled records of access review, supported releases, material
vulnerabilities, backup/restore results, alerts and incidents. Define retention
and customer access without publishing sensitive reports. Triage vulnerabilities
by severity and exposure; approve remediation deadlines and compensating controls
with responsible owners rather than inventing guaranteed repair times.

Material changes to safeguards, processing or suppliers require review and
Customer notice where required. Incident response follows the DPA and breach
procedure. Any customer security questionnaire or warranty must match current
evidence and explicitly state unresolved limitations.

# SafeBus Privacy Incident and Breach Response — Draft

**Status:** Prepared procedure; staffed routing and tabletop evidence pending
**Owner:** Business Privacy Lead / Security Lead and affected customer
**Last updated:** 2026-10-13

## Intake and immediate action

Accept suspected incidents through `[PRIVACY_EMAIL]`, `[SUPPORT_EMAIL]` and the
agreed urgent channel. Report suspected cross-tenant/school access, revoked-session
access, misdirected email, device loss, secret exposure or supplier incidents
immediately. Investigation and containment must not wait for counsel appointment
or proof of significant harm. Do not send credentials or unnecessary customer
records in an ordinary report.

The incident lead records awareness time, reporter/channel, affected scope and
next action; restricts the affected path using reviewed controls; preserves
necessary evidence under a scoped hold; and contacts the Privacy Lead/backup.
Session revocation and Android/realtime handling must use verified workflows;
a code function name alone is not proof that a token has ceased to work.
Do not disable RLS, erase evidence, reset production or conduct uncontrolled
notifications/testing to investigate.

## Assess operational severity and legal harm separately

| Operational priority | Typical SafeBus trigger                                                                                           | Response                                                                  |
| -------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Critical / P1        | Suspected cross-tenant disclosure, exposed privileged credential or unauthorized active-bus visibility            | Immediate containment and senior/customer escalation                      |
| High                 | Suspected inappropriate internal access, material device/supplier compromise or repeated wrong-recipient delivery | Prompt investigation and scoped protective action                         |
| Other                | Suspected limited processing error or concern with unclear exposure                                               | Document and assess promptly; do not dismiss on an initial severity label |

A critical operational event is not automatically a completed statutory
significant-harm finding. Assess sensitivity, minors/driver location, number
and vulnerability of people, recipient, duration, likelihood of misuse,
linkability, effective encryption/key access, recoverability and harm. Record
known facts, uncertainties, reasoned notification decisions and reassessment.
Authorized account access can still be improper if used for an unauthorized
purpose; an access log alone does not make it acceptable.

## Notify under the applicable framework

| Information/relationship                             | Responsibility and reviewed guidance                                                                                                                                                                                                                                                                |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public-body customer transportation records          | Promptly inform the customer under the accepted DPA and provide facts/support. POPA significant-harm notification duties for the public body include affected individuals, OIPC and the responsible Minister; do not omit the Minister or presume SafeBus's notice discharges the customer's duties |
| SafeBus own-business personal information under PIPA | Privacy Lead assesses the significant-harm reporting requirement and the actual statutory timing, informs OIPC where required and handles individual notification requirements/decisions                                                                                                            |
| Cross-border/federal or mixed processing             | Assess additional applicable PIPEDA or other obligations per actual activity; record who performs each notification without contracting away a legal duty                                                                                                                                           |

[Alberta POPA incident guidance](https://www.alberta.ca/report-a-privacy-incident-public-bodies)
and [Alberta PIPA breach guidance](https://www.alberta.ca/organization-responsibilities-for-protecting-personal-information)
are review inputs; verify the actual provision and notice content for the case.

Proposed business contract target: initial customer notice without undue delay
and within 24 hours of awareness of an incident affecting its information,
or sooner where required. This is a proposed contractual target, not a universal
statutory deadline. Do not wait 24 hours when prompt notice is necessary. Do not
wait for a complete investigation. Initial notice states known timing/scope,
categories, containment, contact, uncertainties and next update. Further
updates explain findings, harms, remedies and cooperation.

## Evidence, remediation and review

Keep the restricted incident log, legal-harm assessment, preserved evidence,
authority/hold, affected customer scope, decisions/notices and delivery proof.
Avoid customer rows in GitHub issues, public traces or support screenshots.
Record access and integrity of evidence, supplier communications and relevant
backup effects. Confirm notification recipients independently to prevent a
second disclosure.

Fix the cause through reviewed changes, validate with authorized bounded tests,
review suppliers/controls and update the PIA/risks/notices if necessary. The
incident lead obtains release/return-to-service approval after evidence, not
merely after a patch is merged. Review lessons and revise contact/backup coverage.

## Exercise record — not yet completed

Before operation, run a tabletop using a hypothetical school-location disclosure,
revoked session and misdirected email. Exercise detection, owner absence, containment,
customer coordination, PIPA/POPA recipient distinctions, time tracking, evidence,
holds and follow-up. No actual student data or external notifications are used.
Retain date, participants, scenario, decisions, gaps and assigned actions outside
Git. This drafted procedure is not a passed exercise or Point 6 approval.

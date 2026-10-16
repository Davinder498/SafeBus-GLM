# Point 6, Item 1 — Legal-Role Review Worksheet

**Status:** Prepared for review; legal decisions and customer authority pending
**Prepared:** 2026-10-13 (America/Edmonton)
**Source:** [Legal-role analysis](legal-role-analysis.md)

## Scope of this item

Complete the statutory mapping and SafeBus/customer role determination for the
approved Alberta public-school-authority customer model. Keep the larger Point 6
gate open until its other items and approvals are complete.

The owner confirmed an Alberta business and no appointed privacy counsel, and
identified the operator/seller as Sachman Gold Inc., doing business as SafeBus,
on 2026-10-15. Registration evidence, signing authority, first customer,
representative's delegated authority and executed agreements remain unverified.
The next steps below request evidence, not customer or student data in Git.
They are review/closure steps rather than prerequisites to writing the business
documents. The owner requested the [draft pack](business-pack/README.md) and
PIA now. Customer-specific inputs are completed during onboarding; counsel
appointment is not a blanket statutory or internal launch obligation. DL-023
replaces the former counsel signature with sourced requirements evidence.

## Owner preparation

Before requesting a legal review, assemble these in a restricted evidence folder:

- The contracting party's exact legal name, business form, registration record,
  applicable jurisdiction and authority to sign; do not infer incorporation from
  a business registration or substitute the SafeBus brand for the contracting party.
- The current CR1 scope and this role analysis, including the 100-bus pilot ceiling.
- The existing draft PIA, field inventory, retention schedule, vendor register,
  notices and contract checklist, each clearly identified as a draft.
- The current commercial security remediation record and its unresolved hosted
  acceptance findings, so reviewers do not treat planned safeguards as installed.
- A list of proposed business-account, billing and support activities, and the
  suppliers or remote-access arrangements involved; identify unknowns explicitly.
- Once a customer is selected, evidence of its public-body status and the
  authorized procurement/privacy contacts and delegations. These have not been
  verified for this item; a product-owner decision does not supply this evidence.

Use an access-controlled system appropriate for confidential business and legal
records. Record a sourced applicability/compliance review of the Alberta
public-sector supplier relationship and SafeBus's own private-sector activities.
Seek counsel where a specific issue or customer requirement warrants it.

## Decisions required from accountable reviewers and the customer

| ID    | Question to resolve                                                                                       | Evidence needed to close it                                                                                         |
| ----- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| LR-01 | Which legal business is supplying the service, and who may sign?                                          | Reviewed identity, registration and signing-authority record                                                        |
| LR-02 | Which statutes and regulatory provisions apply to the customer-directed transport activities?             | Dated sourced statutory map identifying relevant provisions, qualifications and customer model                      |
| LR-03 | Is the proposed public-body/service-provider role correct, including POPA's statutory employee treatment? | Sourced role determination and customer confirmation of the processing instructions and allocation                  |
| LR-04 | How are SafeBus's own account, billing, support and employment-related activities treated?                | Separate PIPA/PIPEDA applicability decision per activity, with purpose and necessary data classes                   |
| LR-05 | Who determines lawful collection/use/disclosure, notice and guardian authority?                           | Customer-approved responsibility allocation and a list of field-authority questions for the PIA item                |
| LR-06 | Who decides access, correction and complaint requests, and what must SafeBus provide?                     | Customer/privacy-review allocation addressing ATIA access and POPA correction, authority and required cooperation   |
| LR-07 | Which actual cross-border activities or support arrangements affect the statutory map?                    | Applicability decision identifying known flows and evidence still needed in the vendor/residency item               |
| LR-08 | Who owns and signs the customer PIA, and is submission to OIPC required?                                  | Customer/privacy-review assessment and, where applicable, head/delegate authority; full PIA work follows separately |

For LR-02 through LR-08, use the linked official sources in the analysis as research
inputs. The accountable review verifies applicability against the actual relationship and law.
An unresolved question is recorded as pending, not silently accepted.

## Review brief

The owner can provide the following brief through an approved confidential
channel if specialist review is needed. This repository does not send it automatically.

> SafeBus is an Alberta-registered Canadian business preparing an Alberta
> public-school-authority transportation service. Its first commercial pilot is
> limited to 25–100 buses across one to three tenants. Please review the attached
> statutory map and proposed service-provider role, distinguish customer-directed
> transportation records from our own business activities, and resolve LR-01
> through LR-08. Identify required changes and unresolved evidence. Security,
> vendor, PIA and operational approvals remain open; this request seeks
> a legal-role determination and does not represent launch readiness.

## Closure checklist

Platform review:

- [ ] Contracting identity and signing authority verified in restricted storage.
- [ ] Statutory map and sourced requirements assessment reviewed with dated findings.
- [ ] Customer-directed role and own-business roles determined separately.
- [ ] Required corrections incorporated, with unresolved dependencies assigned.
- [ ] Non-secret references for the mapping and role determination retained;
      confidential records remain outside Git.
- [ ] A human-reviewed PR records the completed item without activating Point 6.

At each customer activation, separately:

- [ ] Participating public authority and appropriate representative identified;
      relevant authority/delegation evidence reviewed.
- [ ] Customer confirms responsibilities, lawful processing instructions, required
      contracts and PIA applicability/signature/submission decisions.
- [ ] Non-secret customer evidence retained in the activation record.

Mapping and role approval support `legal.statutoryMapping` and `legal.safeBusRole`
in `privacy-readiness.json`. Customer-authority and PIA-applicability evidence
supports `scope.privacyAssessmentReference` in `pilot-authorization.json` at
customer activation. The platform PIA field
remains pending until item 2. Do not write placeholder `approved` objects,
invent reviewer signatures or compute an activation digest as approval.

## Review record

| Outcome                             | Status                       | Non-secret evidence reference |
| ----------------------------------- | ---------------------------- | ----------------------------- |
| Contracting identity                | Pending                      | Not recorded                  |
| Counsel appointment                 | Optional; not a blanket gate | Not recorded                  |
| Statutory mapping decision          | Pending                      | Not recorded                  |
| Customer-directed role decision     | Pending                      | Not recorded                  |
| Own-business role decision          | Pending                      | Not recorded                  |
| Customer authority and confirmation | Deferred to onboarding       | Not recorded                  |
| Required corrections accepted       | Pending                      | Not recorded                  |
| Item 1 completion review            | Pending                      | Not recorded                  |

Prepared documents are review inputs. Item 1 is not complete until the checklist
has actual supporting evidence; Point 6 and launch approval remain separate.

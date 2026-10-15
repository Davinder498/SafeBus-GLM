# Commercial readiness: requirement classification

Owner instruction and DL-023, 2026-10-15. This is the current interpretation of
the launch gates, replacing blanket recovery-drill/counsel/support-ticket
prerequisites. The [evidence review](../qa/commercial-readiness-review-2026-10-15.md)
records actual outcomes. Nothing in this classification approves an open record.

## Categories and evidence rules

- **Applicable law:** a duty supported by a current primary source and a recorded
  applicability assessment. The implementation is assessed against the actual
  business, processing activity and customer relationship.
- **Engineering best practice:** a technical safeguard or verification method.
  The law's reasonable-safeguards duty does not prescribe every SQL command,
  test, workflow, numerical threshold or vendor-support interaction.
- **Owner policy:** a product boundary, workflow, commercial promise or approval
  rule chosen by the business. A policy is not described as a statute.

Each finding is passed, failed, unverified or excluded. Missing evidence remains
unverified. Passing local mocks proves local behavior, not provider operation.
Candidate evidence digests identify review inputs; only an explicit later
approval may populate `approvedEvidenceDigest` and activate a readiness record.

## Complete gate inventory

| Requirement / enforcing record                                                                                             | Primary category          | Evidence or boundary                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approved features, geography, supported clients and pilot ceiling                                                          | Owner policy              | Existing CR1 boundary remains; this review adds no features or pilot capacity.                                                                                                                                                                           |
| Manifest, observed baseline, drift, generated types, exact source, source-map rejection and protected checkout             | Engineering best practice | Canonical checks; historical files remain frozen, not replayed or labelled executed.                                                                                                                                                                     |
| Feature branches, human merge/environment approval and final launch decision                                               | Owner policy              | Existing protected workflows remain. Production-change recovery prerequisites are separate from launch acceptance.                                                                                                                                       |
| Authentication, MFA, sessions, RLS, tenant/school/guardian/driver authorization, RPC grants, secrets and dependency checks | Engineering best practice | Apply ASVS controls to actual entry points. Underlying safeguarding duties depend on applicable law.                                                                                                                                                     |
| Default privileges                                                                                                         | Engineering best practice | Assess all 51 entries by creator and effective access. Vendor-managed ownership is not an automatic exception. No support ticket is required to assess or correct a finding.                                                                             |
| Privacy `legal.statutoryMapping`, `safeBusRole`, `requirementsAssessment`                                                  | Applicable law            | PIPA for applicable private-sector activities; POPA/ATIA for the public-school relationship; assess PIPEDA and education/commercial duties separately. Record sources, rationale and evidence.                                                           |
| Platform `legal.privacyImpactAssessment`                                                                                   | Owner policy              | Maintain the platform assessment. A customer PIA becomes a legal requirement where POPA/regulations prescribe preparation/signature/submission.                                                                                                          |
| `privacyProgram.namedPrivacyRoles`, access/correction, guardian authority, student processes, breach response, legal holds | Applicable law            | Assess the specific duties and responsible party. A designated privacy role is not a requirement to appoint a lawyer.                                                                                                                                    |
| `privacyProgram.breachTabletop`                                                                                            | Engineering best practice | Test privacy-response arrangements; it is not a backup/restore exercise.                                                                                                                                                                                 |
| Contract templates: MSA, DPA, Security Schedule, SLA, AUP, Privacy Policy, return/destruction terms                        | Owner policy              | Reviewed templates and truthful public notices; mandatory privacy/contract provisions are addressed in the legal assessment. Actual customer execution belongs to activation.                                                                            |
| Retention `approvedSchedule`, `backupRetentionWindow`; residency/cross-border decisions                                    | Applicable law            | Assess necessary retention, existing copies, holds, transparency and transfers. Removing restore drills does not exempt stored backup copies from privacy duties. A blanket Canada-only rule is owner policy unless a specific law/contract requires it. |
| Retention `isolatedEnforcementTest`, `deletionDryRun`                                                                      | Engineering best practice | Verify the approved behavior without destructive production tests. No database restoration is required by this launch rule.                                                                                                                              |
| Supplier evidence for Supabase, Netlify, Geoapify, email, error monitoring, FCM and Stripe                                 | Engineering best practice | Record actual purposes, contracts, locations, security and cross-border decisions. Assess the underlying supplier/transfer duties under applicable law. Disabled optional services need evidence of that boundary.                                       |
| Notices: guardian, driver/BYOD, public policy, deletion instructions                                                       | Applicable law            | Map actual content, authority and request handling to applicable law. HTTPS publication is an engineering control.                                                                                                                                       |
| Google Play Data safety, device permissions and store declarations                                                         | Owner policy              | Platform distribution conditions; reconcile with actual collection and vendor use.                                                                                                                                                                       |
| Platform Administrator, Product, Security and Privacy evidence approvals                                                   | Owner policy              | Accountable roles may be held by the same qualified owner; records do not invent independent reviewers. Counsel consultation is optional unless a specific requirement applies.                                                                          |
| Customer authority, agreement and `scope.privacyAssessmentReference`                                                       | Applicable law            | Customer-activation record: processing authority, PIA applicability, required head/delegate signatures/submission and contract duties. The chosen reference/approval format is owner policy. Ownership of SafeBus remains with its business.             |
| Android signed build and privacy-safe device/session/storage controls                                                      | Engineering best practice | Native permissions, active-trip-only collection, encryption, lost-device/revocation, offline queue and signed physical-device acceptance.                                                                                                                |
| Maps: approved provider, attribution, key restrictions, quotas and failure fallback                                        | Engineering best practice | Provider licence/contract duties are assessed separately. Numeric usage limits and provider choice are owner policy.                                                                                                                                     |
| Operations `onCall.*`, `support.*`, final role approvals                                                                   | Owner policy              | Named primary/backup personnel, hours, escalation, intake, customer communication and ticket retention. Staffing backup is distinct from database backups.                                                                                               |
| Operations `thresholds.*`, `alerting.*`, P1/privacy response tabletops                                                     | Engineering best practice | Availability, latency, GPS freshness, queue age, quotas, errors; routed alerts, error redaction and map quota alerts. The selected numbers and seven-day observation period are owner policy.                                                            |
| Business workflows, invalid inputs, duplicates, concurrency and isolation tests                                            | Engineering best practice | Role-based functional acceptance; real integration evidence is separate from mock coverage.                                                                                                                                                              |
| UI journeys, loading/empty/error/stale states, responsive layouts, keyboard and accessibility review                       | Engineering best practice | WCAG 2.2 AA review baseline; do not claim a universal Alberta statutory requirement or complete conformance from an automated scan.                                                                                                                      |
| Capacity targets and numerical SLA promises                                                                                | Owner policy              | 10,000 active buses; 100,000 total concurrent users; 1,000,000 accounts; 2,000 organizations. Review only now. Capacity/service promises require measurements before they are made.                                                                      |
| Backup/full-restore, disaster recovery, recovery-time/point and rollback drills                                            | Owner policy — excluded   | Not prerequisites to commercial readiness. Retain historical evidence; no new drills are scheduled in this milestone.                                                                                                                                    |
| Supabase support ticket or unconditional privacy-counsel signature                                                         | Owner policy — excluded   | Neither is proof of compliance or a blanket launch prerequisite. A particular customer contract or legal issue may still call for specialist review.                                                                                                     |

## Readiness record changes

Approval IDs, non-secret-reference formats, source digests and validity windows
(operations 90 days, privacy 366 days, pilot 180 days), seven-day observations,
the 25–100-bus/one-to-three-tenant pilot boundary and 60 operating days are owner
policy. Numerical Android/map acceptance limits are also chosen engineering
acceptance thresholds, not automatically statutory deadlines. No excluded
recovery drill is reinstated by those retained limits.

- Operations format **2** ignores recovery-drill evidence, keeping historical
  rollback evidence separately. Monitoring, alerting, incident response, support,
  observation and accountable approvals remain enforced.
- Privacy format **2** requires a sourced applicability/compliance assessment
  instead of unconditional counsel/customer signatures on the platform record.
  `legal.requirementsAssessment.frameworks` covers `albertaPrivateSector`,
  `albertaPublicSector`, `federalPrivacy`, `educationAndCommercial`; each has
  applicability, source URL, rationale and compliance evidence references.
- Customer activation format **2** retains actual customer authority/agreement
  and requires a customer-specific legal-authority/PIA applicability reference.
  The protected production workflow is still a customer-pilot workflow.
- Version-1 approvals do not silently become version-2 approvals. All current
  records remain not approved/not authorized. Candidate digests are informational.
  Local candidate digests describe the review worktree, not a future runner;
  regenerate approval digests in the exact reviewed release checkout. The existing
  recursive collectors include files present in their evidence directories.

## Primary sources and standards

- [Alberta PIPA responsibilities](https://www.alberta.ca/organization-responsibilities-for-protecting-personal-information)
  and [OIPC PIPA implementation](https://oipc.ab.ca/resource/pipa-implementation/).
- [POPA service providers](https://oipc.ab.ca/resource/popa-guidance-service-providers/)
  and [POPA PIA requirements](https://oipc.ab.ca/resource/popa-pia-template-completion-guide/).
- [OPC jurisdiction overview](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/02_05_d_15/),
  [Alberta education legislation](https://www.alberta.ca/k-12-education-legislation-and-regulations),
  [CRA invoicing/tax guidance](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/gst-hst-businesses/charge-collect-which-rate.html).
- [OWASP ASVS 5.0](https://owasp.org/projects/asvs),
  [WCAG 2.2](https://www.w3.org/TR/WCAG22/),
  [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api).

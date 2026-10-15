# Point 6 — Privacy and Legal Readiness

**Status: Repository evidence gate implemented; Point 6 remains open.**

Commercial Readiness Point 6 requires approved legal roles, a Privacy Impact
Assessment, operating privacy procedures, customer contracts, retention and
deletion evidence, vendor/subprocessor reviews, residency decisions, public and
participant notices, and accountable human approval.

Engineering can preserve and verify that evidence. Engineering cannot make the
legal determinations, execute customer/vendor agreements, or approve the PIA.
This repository control does not constitute legal advice.

## Sequential work, starting 2026-10-13

The owner selected privacy and commercial terms as the next readiness point.
After clarifying that customer authorization concerns customer data rather than
ownership of SafeBus, the owner explicitly requested the business privacy
documents, commercial terms and PIA draft before counsel appointment or customer
selection. The [business pack](phase-3/business-pack/README.md),
[PIA](phase-3/privacy-impact-assessment.md) and supporting procedures are prepared
as drafts with identity/contact placeholders. Review the
[owner decisions](phase-3/business-pack/owner-decisions.md) one at a time.

The owner confirmed an Alberta-registered Canadian business; counsel is not yet
appointed. The reviewed PIPA/POPA guidance does not establish a general legal
obligation to hire Alberta privacy counsel. The existing `privacyCounsel` launch
approval was an internal safeguard. DL-023 replaces that unconditional signature
with a sourced requirements assessment; counsel is optional unless a specific
applicable obligation or negotiated customer term requires it. Draft preparation is
independent of that approval. Customer-specific authority and signatures are
completed at onboarding. No legal, customer or operational approval is claimed.

| Order      | Item                                                     | Completion requirement                                                               |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1 — active | Statutory mapping, legal roles and customer-onboarding procedure | Sourced platform review and identity; actual customer authority checked at activation |
| 2          | PIA and current data/field inventory                     | Complete assessment, authority and appropriate customer sign-off/submission decision |
| 3          | Privacy operating procedures and accountable roles       | Approved procedures, owners and exercise evidence                                    |
| 4          | Customer commercial and privacy contract pack            | Reviewed templates and billing/tax terms; actual customer execution at activation |
| 5          | Retention, deletion and backup handling                  | Approved schedule and authorized execution evidence                                  |
| 6          | Vendors, processing locations and cross-border decisions | Actual supplier, contract, security and residency evidence                           |
| 7          | Participant/public notices and final Point 6 approval    | Approved publication and all required approvals bound to final source                |

Existing drafts remain inputs to their later items. This sequence does not
approve them or remove dependencies: contract and PIA drafts must be reconciled
with later vendor, retention and operational decisions before final approval.
The legal-role determination remains open until its required evidence is
reviewed, but does not block preparation of the other business drafts.

## Fail-closed evidence contract

`privacy-readiness.json` is the machine-readable Point 6 record.
`pnpm privacy:verify` refuses approval unless all required evidence is current,
non-secret, and bound to unchanged release-controlled source.

The record requires:

- Alberta statutory mapping, SafeBus/customer legal-role determination,
  a sourced requirements assessment, and the platform PIA;
- named privacy roles, access/correction, guardian-authority, student-process,
  breach-response, breach-tabletop, and legal-hold procedures;
- approved MSA, DPA, Security Schedule, SLA, AUP, Privacy Policy, and
  data-return/destruction terms;
- an approved retention schedule, isolated enforcement test, deletion dry-run,
  and backup-retention decision;
- individual location, contract, security, and cross-border decisions for
  Supabase, Netlify, Geoapify, email delivery, and error monitoring;
- production, backup, application-hosting, support-access, and cross-border
  residency evidence;
- approved guardian, driver/BYOD, public privacy, account-deletion, and Google
  Play Data safety notices, including both HTTPS public URLs; and
- Platform Administrator, Product, Security and Privacy approvals.

Format 2 requires `legal.requirementsAssessment` to contain approved, dated
evidence plus four `frameworks`: `albertaPrivateSector`, `albertaPublicSector`,
`federalPrivacy` and `educationAndCommercial`. Each records `applicability`
(`applicable` or `not_applicable`), an HTTPS government/regulator `sourceUrl`,
and non-secret `rationaleReference`/`evidenceReference`. A URL/reference is an
auditable review record, not automated certification of a legal conclusion.
Counsel appointment or supplier-support contact cannot replace this evidence.

Platform contract records approve reviewed templates and actual published
business notices. Customer authority, an executed customer agreement and the
customer-specific authority/PIA applicability assessment remain mandatory at
activation through format-2 `pilot-authorization.json`, including
`scope.privacyAssessmentReference`. Where POPA requires a PIA/signature/submission,
the customer's authorized head/delegate must supply it. Ownership of SafeBus
does not supply authority to process a customer's records.

Approval expires after at most 366 days. Changes to the Phase 3 package,
classification/ownership rules, retention function or migration, BYOD notice,
vendor-facing configuration, release workflow, verifier, or related tests
invalidate the source digest.

## Production enforcement

The protected production workflow runs `pnpm privacy:verify` before pilot
authorization, release preflight, database deployment, or application
deployment. The approved JSON record is retained with release evidence.

The committed record remains `not_approved`. It contains no agreement, policy,
vendor, residency, test, publication, or approval references. Merging this gate
does not approve Point 6 and does not publish an unapproved privacy policy.

Only a later, dedicated pull request may activate the record. Executed
agreements, legal advice, customer names, individual contact details, test
credentials, personal information, and vendor secrets stay in the approved
restricted evidence system. Git contains only non-secret references.

## Database boundary

The retention enforcement test remains open because the only hosted Supabase
project is production. Do not apply migrations, activate destructive retention,
create fixtures, or run the Phase 3 RLS suite there. Point 6 cannot close until
the approved schedule and deletion behavior are exercised on an explicitly
approved isolated target and reviewed by accountable privacy owners.

## Exit record

| Evidence group                             | Current state                             | Owner                           |
| ------------------------------------------ | ----------------------------------------- | ------------------------------- |
| Legal role and PIA                         | Draft; sourced review/customer applicability pending | Privacy Lead; optional specialist advice |
| Privacy program and tabletop               | Draft; operational evidence pending       | Privacy / Security / Operations |
| Customer contract pack                     | Draft checklist; execution pending        | Counsel / Product / Customer    |
| Retention schedule and enforcement         | Draft; isolated execution pending         | Privacy / Engineering           |
| Vendors, residency, and cross-border flows | Vendor decisions and agreements pending   | Privacy / Product / Security    |
| Notices and public policy                  | Drafts pending approval and publication   | Privacy / Customer              |
| Final Point 6 approval                     | Pending                                   | Required approval roles         |

Generate the digest after the approved source package is final:

```bash
pnpm privacy:digest
```

Point 6 closes only when `pnpm privacy:verify` passes on the activation pull
request and the required human reviewer approves that pull request. Point 6
approval alone does not authorize the Commercial Release 1 pilot.

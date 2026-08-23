# Point 6 — Privacy and Legal Readiness

**Status: Repository evidence gate implemented; Point 6 remains open.**

Commercial Readiness Point 6 requires approved legal roles, a Privacy Impact
Assessment, operating privacy procedures, customer contracts, retention and
deletion evidence, vendor/subprocessor reviews, residency decisions, public and
participant notices, and accountable human approval.

Engineering can preserve and verify that evidence. Engineering cannot make the
legal determinations, execute customer/vendor agreements, or approve the PIA.
This repository control does not constitute legal advice.

## Fail-closed evidence contract

`privacy-readiness.json` is the machine-readable Point 6 record.
`pnpm privacy:verify` refuses approval unless all required evidence is current,
non-secret, and bound to unchanged release-controlled source.

The record requires:

- Alberta statutory mapping, SafeBus/customer legal-role determination,
  customer authority, and the approved PIA;
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
- approved guardian, driver/BYOD, public privacy, and Google Play Data safety
  notices, including the HTTPS public-policy URL; and
- Platform Administrator, Product, Security, Privacy, privacy-counsel, and
  customer-authority approvals.

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
approved isolated target and reviewed by counsel/privacy owners.

## Exit record

| Evidence group                             | Current state                             | Owner                           |
| ------------------------------------------ | ----------------------------------------- | ------------------------------- |
| Legal role and PIA                         | Draft; counsel/authority approval pending | Privacy Lead / Counsel          |
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

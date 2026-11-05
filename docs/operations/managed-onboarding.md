# SafeBus-managed school-authority setup

**Owner direction:** 2026-11-05
**Status:** Procedure prepared; no completed customer onboarding claimed

The SafeBus team handles initial setup of routes, stops and route maps, buses,
minimum student records, guardians and authorized links, drivers and assignments.
The school authority provides lawful source information and reviews the result.
Schools remain optional organizational metadata; the school authority is the
customer and authorization boundary. Existing administrator features remain.

## Before receiving source data

1. Record the authority's authorized representative, documented instructions,
   permitted data, setup quantities/scope and acceptance contact in the restricted
   onboarding record. Complete applicable customer terms and privacy requirements.
2. Agree a restricted transfer channel and authorized senders/recipients. This
   procedure does not provision one. Do not ask for rosters or guardian-link
   evidence through the public inquiry form, ordinary support email or GitHub.
3. Identify each team member's customer-authorized account, existing permitted
   role, school-authority scope and administrator MFA. Do not use shared customer
   passwords, broad platform-admin browsing, service-role frontend logic or an
   RLS bypass. Verify access with the reviewed role-boundary workflow before work.
4. Agree handling of temporary working copies, necessary retention/holds and
   disposal evidence. No business home address or confidential customer evidence
   belongs in the public repository or website.

## Configure and validate

- Receive only the minimum supported transport fields. Exclude prohibited
  student identifiers, student home addresses, health and custody narratives.
  The authority decides guardian entitlement; the team records its authorized
  links rather than independently inferring family relationships.
- Use existing authorized screens and the supported student CSV workflow where
  appropriate. Do not promise bulk route/bus/guardian/driver imports that have
  not been implemented and accepted. Never run direct production fixture or
  service-role writes as an onboarding shortcut.
- Create/reconcile buses, drivers, routes, stops/geometry, students, guardians
  and date-effective assignments in a workable dependency order. Check existing
  records before retrying creation to prevent duplicates. Record source-version
  and correction decisions securely; avoid extra local copies.
- Verify route-map geometry, stop locations/order, assignments and the minimum
  driver manifest with the authority. The authority retains transport-safety
  decisions. A plausible map or successful save is not route-safety approval.
- Review student counts, duplicates, missing/invalid fields, guardian links,
  driver/bus service assignments and dates. Verify each role's intended access
  and failure behavior through the accepted workflow; a setup account seeing
  everything in its scope is not proof that a guardian/driver is correctly scoped.

## Review, handover and changes

Provide the authority a restricted review of its own configured data, corrections
and unresolved items. Record its approval before operational use, the handover
date, responsible administrators and agreed next steps. Apply normal invitation,
MFA and notification flows; do not send external messages as QA, auto-opt-in a
recipient or add a new per-authority platform privacy approval gate.

Review/remove team setup access at handover. Continued maintenance needs current
authorization and the agreed order scope; no unlimited ongoing data-entry service
or price is inferred from initial setup. Track changes and authority instructions.
Dispose of temporary files through the accepted schedule, with scoped evidence
and any lawful hold exceptions. Do not certify deletion from unverified systems.

Acceptance records contain instruction/access references, source scope, checks,
authority review/corrections, handover, access review and temporary-copy disposal.
Store actual customer records and evidence privately. This checklist and the
draft agreements do not constitute an exercised onboarding or launch approval.

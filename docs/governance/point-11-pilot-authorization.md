# Point 11 — Controlled Pilot Authorization

**Status: Fail-closed engineering gate implemented; Point 11 remains open.**

Point 11 requires a signed pilot plan, explicit entry and exit criteria, and
named suspension and rollback authority. This record converts those
requirements into a machine-enforced production-release boundary. It does not
authorize a pilot. The committed authorization remains `not_authorized` until
all launch gates and human approvals are complete.

## Pilot boundary

Commercial Release 1 is limited to:

- one to three approved public-school-authority tenants;
- 25 to 100 buses total;
- explicitly selected schools, drivers, and guardians;
- at least 60 operating days of high-touch support;
- only the capabilities approved in the CR1 scope; and
- immediate suspension and rollback authority.

Expansion above 100 buses, a different customer type, unselected participants,
or a broader product scope requires a new accepted decision and new security,
privacy, capacity, support, and commercial evidence. A successful pilot never
automatically authorizes expansion.

## Fail-closed release contract

`docs/governance/pilot-authorization.json` is the machine-readable authorization
record. The protected production workflow requires both operator confirmations
and runs `pnpm pilot:verify` before database or application deployment.

The verifier requires:

- `status: authorized`, a valid pilot ID, approval and expiry dates, and a
  maximum authorization window of 180 days;
- all Commercial Readiness Points 4 through 10 recorded as approved;
- scope within the tenant, bus, participant, and 60-operating-day ceilings;
- non-secret evidence references for school selection, participant selection,
  the customer agreement, and every required approval;
- Platform Administrator, Product Owner, Security, Privacy, Operations, and
  customer-authority approval;
- primary and backup contact references with immediate suspension and
  application-rollback authority; and
- a SHA-256 digest matching the release-controlled web, mobile, package,
  migration, release-script, dependency, and workflow inputs.

Any later release-controlled source change invalidates the authorization until
the digest is recomputed and the revised evidence is approved. Authorization
expiry, a missing approval, an open gate, or a ceiling violation fails the
release before it connects to the production database.

## Entry criteria

- [ ] Points 4 through 10 have final approval and linked evidence.
- [ ] Counsel and the customer authority approve the legal role, privacy terms,
      residency, retention, breach process, and vendor/subprocessor terms.
- [ ] The selected schools, drivers, guardians, routes, buses, support hours,
      training, and communications are documented outside the repository in an
      approved privacy-controlled system.
- [ ] On-call routing, provider quota alerts, rollback, recovery, and incident
      drills pass.
- [ ] Signed Android, real-device, Google Play, map-provider, authenticated E2E,
      accessibility, and capacity evidence pass.
- [ ] Baseline metrics, stop thresholds, evidence retention, and customer
      communication owners are approved.
- [ ] `pilot:digest` is captured after the release-controlled source is final,
      and the authorization record is approved through a dedicated PR.

## Immediate stop triggers

The primary or backup authority suspends the pilot immediately for:

- a suspected tenant, role, guardian/student-link, or privacy boundary failure;
- background location outside a driver-authorized active trip;
- a critical/high security finding or unresolved privacy incident;
- material authentication, live-location, map, notification, or support failure
  beyond the approved threshold;
- loss of required vendor service, quota, residency, insurance, contract, or
  legal approval;
- loss of on-call or recovery capability;
- operation beyond the approved participants, tenant count, bus ceiling, dates,
  or product scope; or
- withdrawal by the customer authority or Final Decision Holder.

Suspension stops new onboarding and operating use. Application rollback follows
the protected rollback runbook. Database recovery is separately authorized and
must never be rehearsed destructively against the sole production database.

## Exit criteria

- [ ] Complete at least 60 measured operating days within the approved scope.
- [ ] Resolve every critical/high security, privacy, reliability, accessibility,
      and support finding.
- [ ] Meet the approved availability, GPS freshness, notification, incident,
      recovery, support, adoption, and capacity thresholds.
- [ ] Complete customer and internal post-pilot reviews with evidence references.
- [ ] Decide in writing to stop, extend within 180 days, or propose a separately
      reviewed expansion. No automatic continuation is permitted.

## Authorization procedure

1. Complete and approve every entry criterion.
2. From the final reviewed source, run `pnpm pilot:digest`.
3. Update `pilot-authorization.json` with the digest, narrow scope, dates,
   non-secret evidence references, approvals, and contact references.
4. Review the authorization in a dedicated PR. Do not put personal information,
   customer records, credentials, contracts, or confidential contact details in
   Git.
5. Use the protected production environment and exact 40-character reviewed
   commit. Enter both `DEPLOY_PRODUCTION` and `AUTHORIZE_CR1_PILOT`.
6. Retain the release artifact, authorization record, approval references, and
   operating evidence under the approved retention process.

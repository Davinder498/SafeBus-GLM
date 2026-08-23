# Point 10 — Product Verification

**Status: Repository-controlled automated verification complete; Point 10 remains open.**

Commercial Readiness Point 10 requires authenticated end-to-end,
accessibility, resilience, and load evidence for the Commercial Release 1
workflows. The repository now makes all four evidence categories blocking in
the existing `Browser smoke tests` check without adding production credentials,
test backdoors, or database writes.

## Automated evidence

Run:

```bash
pnpm test:product-verification
```

The gate covers:

- authenticated tenant-administrator transportation and trip review;
- driver QR bus start, active tracking state, and confirmed trip end;
- guardian linked-student bus status and role isolation;
- automated WCAG 2.2 A/AA scans on representative public, admin, driver, and
  guardian surfaces at desktop and mobile viewports;
- safe profile, guardian-data, map-provider, and unauthenticated failure states;
  and
- a bounded local release-shell load guard: 60 requests, concurrency 10, no
  failed application-shell responses, and local p95 at or below 2.5 seconds.

All authenticated browser scenarios intercept Supabase at the Playwright
boundary with deterministic synthetic accounts. Unexpected table access fails
closed. The load guard accepts only the Playwright localhost origin. Raw
backend errors, response bodies, credentials, real identifiers, and personal
information are not retained as evidence.

## Evidence boundary

The automated gate proves application routing, role presentation, critical UI
state transitions, automated accessibility rules, safe degraded presentation,
and regression-level local delivery performance. It does not prove hosted
Supabase Auth or RLS, production provider behavior, a signed Android build on a
physical device, or independent tenant isolation. The local bounded load guard
does not establish production capacity or an SLA.

The sole hosted Supabase project is production. Point 10 work must not create
test accounts, seed data, or destructive scenarios there. Hosted authenticated
and database-bound evidence remains coupled to the separately approved Point 5
isolated-target procedure.

## Point 10 exit gates

- [x] Make authenticated admin, driver, and guardian CR1 journeys a blocking
      automated browser gate.
- [x] Make automated WCAG 2.2 A/AA scanning a blocking browser gate.
- [x] Make representative auth, data-service, and map outage behavior a
      blocking browser gate.
- [x] Add a bounded, repeatable, non-production load guard with recorded
      thresholds.
- [ ] Run authenticated hosted end-to-end journeys with approved synthetic
      accounts in an isolated target and retain the reviewed evidence.
- [ ] Complete keyboard-only, 320 CSS pixel, 200% zoom, NVDA, and VoiceOver
      acceptance for every CR1 workflow.
- [ ] Approve production capacity targets and run a separately authorized load
      exercise against an isolated production-like target.
- [ ] Resolve every critical/high finding and document owners and deadlines for
      any accepted lower-severity finding.
- [ ] Obtain QA, Security, Accessibility, Product Owner, and Platform
      Administrator approval.

## Evidence record

| Evidence                         | Reference                                | Owner                  | Date | Result |
| -------------------------------- | ---------------------------------------- | ---------------------- | ---- | ------ |
| Repository browser gate          | `Browser smoke tests` on the reviewed PR | Engineering            |      |        |
| Authenticated synthetic journeys | `commercial-authenticated-e2e.spec.ts`   | Engineering / QA       |      |        |
| Automated WCAG scans             | `commercial-accessibility.spec.ts`       | Engineering / QA       |      |        |
| Synthetic resilience             | `commercial-resilience.spec.ts`          | Engineering / QA       |      |        |
| Bounded local load guard         | `product-load.spec.ts`                   | Engineering / QA       |      |        |
| Hosted authenticated E2E         | _pending approved isolated target_       | Security / QA          |      |        |
| Manual accessibility             | _pending_                                | Accessibility / QA     |      |        |
| Capacity exercise                | _pending target and threshold approval_  | Operations / QA        |      |        |
| Final Point 10 approval          | _pending_                                | Platform Administrator |      |        |

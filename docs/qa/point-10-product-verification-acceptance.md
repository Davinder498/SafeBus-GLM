# Point 10 Product Verification Acceptance

Use synthetic, non-personal data only. Do not create test accounts or fixtures
in the sole production database. Do not put credentials, raw locations,
student identifiers, response bodies, or provider keys in screenshots, reports,
issues, or test artifacts.

## Repository-controlled gate

- [ ] Run `pnpm test:product-verification` from the reviewed commit.
- [ ] Confirm authenticated admin, driver, and guardian journeys pass on
      desktop and mobile Chromium.
- [ ] Confirm role-denial checks pass and no guardian receives an administrator
      or driver surface.
- [ ] Confirm WCAG scans report no automated A/AA violation.
- [ ] Confirm profile, guardian-data, and map failures show controlled states
      without raw backend details or stale live-location claims.
- [ ] Confirm the local load artifact reports 60 responses, zero failures,
      concurrency 10, and p95 no greater than 2.5 seconds.

## Hosted authenticated evidence

This section may run only after an approved isolated target exists under the
Point 5 procedure.

- [ ] Create synthetic administrator, driver, and guardian accounts in the
      approved isolated target.
- [ ] Verify sign-in, MFA for administrators, session expiry, password recovery,
      role routing, and sign-out.
- [ ] Complete one administrator transportation review, one driver bus-start
      and trip-end journey, and one guardian linked-student visibility journey.
- [ ] Confirm cross-role and cross-tenant denial with an independent reviewer.
- [ ] Delete the isolated target after retaining privacy-reviewed evidence.

## Manual accessibility

- [ ] Complete keyboard-only testing at 320 CSS pixels and 200% zoom.
- [ ] Complete NVDA with current Chrome on Windows.
- [ ] Complete VoiceOver with current Safari on an approved Apple device.
- [ ] Verify focus order and visibility, dialogs, errors, status announcements,
      tables, maps, timeout behavior, and reduced motion.

## Capacity and final approval

- [ ] Product and Operations approve expected tenant, bus, guardian, driver,
      location-update, and notification volumes.
- [ ] Security and Operations approve the isolated production-like target,
      request ceiling, stop conditions, and monitoring for a capacity exercise.
- [ ] Run the exercise without production personal data and record p50, p95,
      error rate, saturation point, and recovery behavior.
- [ ] Resolve findings and obtain QA, Security, Accessibility, Product Owner,
      and Platform Administrator approval.

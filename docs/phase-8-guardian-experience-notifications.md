# Phase 8 — Guardian experience and notifications

Status: repository implementation complete; hosted-DEV, privacy, load, and WCAG exit evidence pending.

## Reconciled baseline

Phase 8 keeps the existing bus-first guardian response and durable email outbox. The merged baseline already provided linked-student RLS, narrow bus/location states, event deduplication, ordered outbox claims, leases, retry backoff, provider idempotency, delivery metadata, cancellation after eligibility loss, and aggregate admin delivery status.

Migration `0087_phase8_guardian_experience_notifications.sql` closes the remaining gaps:

- Guardian bus responses now use `get_guardian_bus_visibility_v2()`. It accepts no guardian, student, trip, route, bus, or tenant identifier and filters expired links on the server. The former browser RPC is no longer executable by `authenticated`.
- Guardian access can have an optional expiry. Every guardian read and delivery decision evaluates the expiry against server time; it does not depend on a scheduled cleanup.
- Revoking a link immediately disables preferences and cancels its pending or leased notification work.
- Guardians choose email, pickup, and drop-off independently for each currently authorized student. Turning email off is an immediate unsubscribe.
- Existing administrative `can_receive_notifications` values are not treated as consent. Preferences fail closed until the guardian saves an explicit choice.
- Each tenant has a fail-closed privacy-review gate plus daily and per-minute quotas. No tenant is enabled automatically.
- Claims are ordered and skip-locked, limited by tenant quota and a provider-wide per-minute cap, and revalidate the link and preferences. Payload resolution repeats every authorization check immediately before provider delivery.
- Exhausted retries and permanent provider errors enter a distinct `dead_lettered` state. Aggregate admin delivery status includes dead-lettered work without exposing recipients, student names, message bodies, provider identifiers, or outbox identifiers.
- The scheduler drains the durable queue every five minutes instead of once per hour. Provider idempotency remains based on the stable outbox UUID.

The guardian browser never receives a manifest, other students, other stops, route geometry, driver identity, internal authorization identifiers, recipient lists, or provider data.

## Privacy approval and defaults

The implemented default is **off**. A Privacy Lead and authorized tenant representative must approve the exact event types, email copy, retention, support process, and tenant limits before notifications can be enabled. Record that approval outside the application, then apply the approved values to hosted DEV or the target environment through an authorized server-side/admin SQL process:

```sql
update public.guardian_notification_delivery_policies
set privacy_review_status = 'approved',
    privacy_approved_at = now(),
    privacy_approved_by = '<authorized-profile-uuid>',
    tenant_daily_limit = 500,
    tenant_per_minute_limit = 20,
    notifications_enabled = true
where tenant_id = '<approved-tenant-uuid>';
```

Do not enable production from a developer workstation and do not use a browser service-role key. Rejection or withdrawal must set `notifications_enabled = false` in the same authorized operational path.

## Plain-language and accessibility checks

The preferences page uses a heading, per-student `fieldset` and `legend`, explicit checkbox labels, 44-pixel minimum controls, keyboard focus indicators, disabled-state semantics, and polite success/error announcements. Copy avoids “push,” “webhook,” “outbox,” “payload,” and internal status terms. It states that an event email is not live child tracking and does not confirm safety or custody.

Before exit approval, test the guardian home, live map, bus status, pickup/drop-off, and email choices at 320 CSS pixels and 200% zoom with keyboard only and current versions of NVDA/Chrome and VoiceOver/Safari. Run an automated WCAG 2.2 AA audit and record all findings. Critical issues must be fixed; serious non-critical exceptions require an owner and approved deadline.

## Hosted-DEV validation

Apply `0087` manually to hosted Supabase DEV, then run:

```bash
pnpm test:rls:dev -- tests/rls/phase8-guardian-experience-notifications-rls.sql
pnpm test:rls:dev -- tests/rls/guardian-linking-rls.sql
pnpm test:rls:dev -- tests/rls/guardian-bus-first-visibility-rls.sql
pnpm test:rls:dev -- tests/rls/guardian-email-notification-delivery-rls.sql
```

Use synthetic people only. Verify two guardians in the same tenant, a cross-tenant guardian, an expired link, a revoked link, pickup-only consent, drop-off-only consent, and full unsubscribe.

For load/failure testing, enqueue synthetic authorized events across at least three tenants. Exercise provider `429`, `500`, timeout, permanent `4xx`, an expired claim lease, concurrent dispatcher invocations, tenant daily exhaustion, tenant per-minute exhaustion, and provider-wide exhaustion. Reconcile every source event to exactly one delivered, cancelled, or dead-lettered outbox row and confirm FIFO ordering within each available queue.

## Exit gate

- [ ] Migration `0087` applied to hosted DEV.
- [ ] Cross-guardian, cross-student, and cross-tenant privacy tests pass.
- [ ] Revocation and server-time expiry remove guardian access immediately.
- [ ] Privacy Lead approves default-off behavior, copy, retention, and tenant limits.
- [ ] Retry, lease recovery, deduplication, dead-letter, provider-limit, tenant-quota, and unsubscribe tests pass at approved load.
- [ ] WCAG 2.2 AA audit has no unresolved critical issues.
- [ ] Plain-language review is approved by representative guardians and operations staff.

Phase 8 is not production-approved until every checkbox has evidence.

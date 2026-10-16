# SafeBus pricing, navigation, and test tenant access

Prepared implementation on `codex/branding-pricing-navigation`. No migrations,
production records, Stripe catalog objects, subscriptions, or deployments were
changed during implementation.

## Hosted reconciliation

Read-only verification on 2026-10-16 against the production-designated project
`ckrkfylsyihwouvesypm` used an explicit read-only transaction, a five-second
statement timeout, a one-second lock timeout, and final rollback. Both requested
accounts have verified email addresses, active tenant-administrator profiles,
and active tenants. The incomplete first address resolves to the existing
`davinder.silverhome@gmail.com` account; the second is
`davinder.sachmangold@gmail.com`.

The approved pairs are:

| Tenant ID                              | Administrator profile ID               |
| -------------------------------------- | -------------------------------------- |
| `e19ab3b1-8346-4779-9fdb-46de90081a07` | `5ba7237a-7c29-4eb7-88d8-6e9a45189566` |
| `49410f95-38da-4eed-aaef-c6b6b98e9a7c` | `6f1a03d0-034a-4aa4-9457-1c51138a8bea` |

The hosted `get_bus_subscription_access()` and private `tenant_billing_control`
are still absent. The previously prepared self-service subscription migration
must be reconciled and released before the new pricing/test-access migration.
The new migration refuses to seed access unless both approved profiles still
belong to their verified tenant IDs and have active tenant-admin roles and
confirmed Auth identities. Email strings are never an authorization allowlist.

## Billing and access behavior

- The private exemption table grants bus configuration and activation without
  checkout or a synthetic subscription. Its unlimited allowance is separate from
  paid capacity, and the tenant's active status remains required. The existing
  bus trigger and tenant-row lock still cover direct inserts and activations.
  Clients cannot read or change exemption records, including through service-role
  table access. No public exemption mutation endpoint is added.
- `/admin/pricing` is platform-admin only. Its authenticated server endpoint
  retains verified sessions, MFA, recent sign-in for mutations, and rate limits.
  Tenant financial changes remain tenant-owned; the existing platform subscription
  endpoint still permits reconciliation only.
- Price publishing creates CAD licensed per-bus month/year prices on the server's
  configured Stripe product. Archiving only changes availability. Existing
  subscriber prices, invoice contracts, and trial history remain unchanged.
- Discounts use product-restricted coupons and redeemable promotion codes, with
  percent or fixed CAD amounts, once/forever duration, redemption limits, and
  optional expiry. Codes are redeemed in hosted Checkout. Archiving a code stops
  new redemptions without deleting existing discounts. Schedule changes reuse
  existing discount instances rather than issuing a fresh redemption.
- Private catalog requests are bound to actor, request UUID, action, and payload
  hash. A profile-row lock serializes an actor's outstanding request. Retries use
  the same Stripe idempotency keys; deterministic coupon IDs and unique price
  lookup keys recover beyond the provider's idempotency retention. Completion and
  the existing `security.config_changed` audit entry commit atomically.
- Catalog recovery reads the original payload through the verified server caller.
  Financial request bodies are never persisted in browser storage.
- No price or discount was invented or published during implementation. Tax
  behavior and registrations are unchanged; confirm approved commercial prices,
  GST configuration, and provider acceptance before commercial use.

## Presentation

Historical brand text is displayed as SafeBus in profiles, organization and
onboarding summaries, billing, in-app notifications, and Android push content.
Stored historical records, immutable migrations, infrastructure identifiers,
project names, and hosting URLs are not renamed.

Tenant settings are in the profile menu immediately below Privacy notice. Schools
are a sidebar destination at `/admin/schools`; the old settings URL redirects
there. The school page no longer includes settings tabs. Sidebar divider lines
and visible scrollbars are removed while scrolling remains available.

## Validation and release boundary

Local validation passed: `pnpm typecheck`, `pnpm lint`, `pnpm build`, and
`pnpm test` (434 web tests, two mobile tests, and 349 release checks). The 16 new
desktop/phone browser scenarios and ten existing billing scenarios passed,
including WCAG checks and screenshots. Migration verification passed for all
125 immutable active files. Existing bundle-size warnings remain informational.

Mocked provider tests and embedded PostgreSQL execute the full new migration
against synthetic identities and verify scoped exemptions, bus insertion and
activation, suspension, private grants, claim conflicts, retries, and audit replay.
The embedded engine queues concurrent requests through one backend; a genuine
multi-session contention rehearsal remains a protected-release responsibility.
Browser coverage includes price and discount review/publishing/archiving,
interrupted-request recovery, role rejection, navigation, branding, test bus
access, mobile layout, and WCAG checks. No real QA emails or payments are sent.

`config/pending/pricing-catalog-authorization.json` reviews the three service-only
RPCs separately from the active authorization manifest. The generated hosted
type snapshot, active migration checksums, and installation/release protections
remain unchanged. Refresh hosted reconciliation and recovery evidence, perform
the approved rollback-only rehearsal, promote both pending migrations and their
authorization entries in order, regenerate hosted types, and obtain human release
approval before activation. Updated push display copy also requires its existing
protected Edge Function release; it was not deployed here.

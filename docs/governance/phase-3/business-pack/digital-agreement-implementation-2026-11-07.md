# District digital MSA/DPA onboarding — staged implementation

**Status:** Engineering implementation staged on `feature/district-agreement-onboarding-20261107`; **not live, not approved for signing**. No PR is opened and no production migration has been applied as part of this work.

## Implemented

- Tenant-admin invitation completion now leads to `/admin/onboarding/agreements` rather than the billing page. Existing MFA in `ProtectedRoute` still applies. Driver/guardian invitations are untouched.
- `/admin/settings/agreements` offers a returning district administrator a single responsive document review page with the existing SafeBus semantic colors, typography and shared UI controls.
- The page shows the complete bound document text returned by an authenticated tenant-scoped RPC, includes all eight exact version/digest references, and downloads the original Markdown content. A document view/acknowledgement is never treated as a signature.
- If authorized by a platform evidence review, the verified tenant administrator can give explicit electronic-transactions consent and a distinct signature-intent confirmation, name and title, backed by server-side AAL2, role, tenant, session, authority and document hash checks.
- District officers who do not have authority may request a verified officer referral; a district can request its own signing process. These are requests only: **no external/officer invitation is sent automatically**.
- Platform tenant detail shows contract status metadata, authority-verification state and pending referral count without revealing the contract text or any student/driver/guardian data.
- The new pending migration creates private, RLS-enabled versioned document, package, referral, activation-check and append-only event records with narrow `SECURITY DEFINER` RPCs. It cannot mark a package executed or activate service.

## Deliberate fail-closed limits

1. **The existing contract drafts are not published into the agreement database.** No version is seeded or approved; the package will display `not_issued`. Contracts must be finalized and approved, including customer-specific price/tax/order/insurance/retention/supplier positions.
2. No customer payment, active entitlement or existing school authority operation is gated or retroactively suspended. Live production currently contains real active tenant administrators; a new activation gate requires a separate transition plan.
3. No legal-only officer invite-token generation, sender integration, token lifecycle, receipt generation, immutable executed-PDF storage, external executed-contract verification, or provider finalization RPC is exposed. A pending referral cannot masquerade as a delivered invitation or acceptance.
4. An authorized tenant-admin signature can only reach `pending_provider_signature`; a provider countersignature can only reach `execution_pending`. Neither is an executed contract or permission to process real student data.
5. The empty activation-check table is not evidence of PIA, supplier, insurance, capacity, contract, or finance approval.
6. A customer signature is permitted only after a real operator has approved **all eight exact full document versions**, issued the specific tenant package and independently verified that tenant administrator's legal delegation. A platform super-admin cannot sign as the customer.

## Required remaining work before production activation

- Approve complete MSA, DPA, Order Form, Security, SLA, Acceptable Use, Data Return/Destruction and Supplier Disclosure versions, with documented authority procurement review, effective date, rates, tax, liability, signed contract precedence and privacy-specific approvals.
- Implement a restricted, audited platform document publication/approval surface with document hashing, customer-order review and exact document display verification. No draft placeholders may be put into issued contracts.
- Implement an actual legal-only, one-time-token signer process including recipient/authority identity checks, limited scope, delivery, expiry, single-use protections and negative security tests. The current officer request is a human-review queue, **not an invitation**.
- Implement trusted executed PDF+receipt generation, durable private storage, proof verification, signing artifacts retrieval, external-signature reconciliation, amendment/supersession, retention and privileged reviewer approval. A plain Markdown download is not an executed PDF.
- Implement and verify complete tenant activation and billing enforcement across **every** relevant server RPC, RLS and Netlify function. Apply a migration/transition policy for existing districts and payment terms; avoid breaking existing operations.
- Validate migration replay, static checks, TypeScript, Vitest, security tests, least-privilege RPC grants, multi-tenant isolation, MFA and session revocation. Use synthetic tenants only until controls and legal content are approved.
- Follow the existing protected production release, apply migration only after database compatibility and rollback preparation are verified, then perform hosted smoke tests. Do not call the code production-ready before this.

## Relevant paths

- `apps/web/src/pages/DistrictAgreementsPage.tsx`
- `apps/web/src/services/districtAgreementService.ts`
- `apps/web/src/services/districtAgreementService.test.ts`
- `apps/web/src/routes/router.tsx`
- `apps/web/src/pages/AcceptInvitationPage.tsx`
- `apps/web/src/components/settings/AdminSettingsNav.tsx`
- `apps/web/src/pages/PlatformTenantDetailPage.tsx`
- `packages/types/src/database.ts`
- `supabase/migrations/pending/20261107121500_district_agreement_workflow.sql`

**Never tell a school district this staged functionality is already executable or that officer emails were sent.**

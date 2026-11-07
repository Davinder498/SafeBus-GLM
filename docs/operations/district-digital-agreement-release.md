# SafeBus digital district MSA/DPA — engineering implementation and release

**Status:** Source implementation prepared for review, **NOT RELEASED**, unsigned commercial drafts **NOT APPROVED**.  
**Scope:** School-authority tenant administrators on the SafeBus web app; authorized contract signers receive a document-only link. No individual school administrator product role. No driver/guardian signing changes.  
**Visual system:** Existing `apps/web/src/theme/appearance.css` roles, including SafeBus navy `#172b3a`, blue action `#1d4ed8`, white cards, Inter, semantic focus ring and mobile-responsive dashboard components. No second theme or new vendor.

## Implementation

- `/accept-invitation`: district admin completes existing password setup; destination now `/admin/onboarding/agreements` rather than billing.
- `/mfa`: existing administrator MFA is required before the agreement page, review requests and platform administrative actions.
- `/admin/onboarding/agreements`: tenant admin reads the complete **versioned** eight-document bundle, sees its digest and status, requests a signing officer by name/title/work email. This does **not** itself declare the admin the signer or issue a contract.
- `/admin/tenants/:tenantId/agreements`: platform owner prepares *final* MSA, DPA, Order Form, Security Schedule, SLA, acceptable use, return/deletion, and supplier appendix, with exact version and a private approval reference. Then verifies the district officer's authority against external restricted evidence and sends the officer a restricted, single-use signing invitation. After customer signature SafeBus records its own authorized countersignature. Actual protected launch approvals must be accepted **separately**.
- `/agreements/sign#token=...`: server-issued 256-bit random one-time token in URL fragment (not in an HTTP request URL). Server stores only its SHA-256, expiry is 48h, and resolves only the exact package for which authority has been verified. Full documents are displayed; signer reviews each, confirms electronic records/signature consent and that they hold authority, and signs the immutable bundle hash. The token is consumed atomically. Link possession alone is not independent proof of legal identity; authority verification by the district and appropriate procurement/e-sign method are essential.
- The public page does not reveal roster, route, bus, GPS, financial, or other district tenant information.
- Signed package status and data remain in the **private** Supabase schema, not an openly accessible Storage bucket. Immutable signer events record the bundle hash and timestamps. No customer data/signatures are written to public Git.

## Activation and migration safety

**Prepare only:** `supabase/migrations/pending/20261107154500_district_digital_agreements.sql` is deliberately outside the active migration manifest. Do **not** apply it to BusSafe until the protected production release and catalog/RLS review approve the exact release. All existing tenants are grandfathered with `agreement_gate_required=false`, while all new inserts after installation are forced to `true` by a database trigger. The flag is immutable through tenant administration.

The new tenant's database profile may be active to finish password and MFA, but ordinary transportation, database, Realtime, Storage, and billing operations remain blocked. The PostgREST pre-request denies all but a fixed authentication/status/signing-request allowlist; row-level restrictive policies also cover previously existing public tables and provider Realtime/Storage relations when present. Existing security helpers and session checks still apply. The authenticated business signer has no tenant membership. Service-role Stripe entry points independently reject unapproved districts.

**Protected final approval gate:** An executed agreement does **not** activate operations. The preparation migration creates `safebus_private.district_activation_release_control` with **no approved rows**. After all mandatory privacy, supplier, security, operations, and pilot evidence is accepted, a separate protected release must bind the particular tenant, its exact executed bundle SHA-256 and the approved normalized evidence digest. No web or client RPC can create that authorization. A platform administrator cannot bypass this by writing an arbitrary reference into a textbox.

The launch approvals are currently **NOT APPROVED**. The code and migration do not approve privacy-readiness, map-readiness, operations-readiness, customer activation, annual pricing, GST/HST treatment, insurance or a school authority PIA. **Never mark a customer contract executed based on a prelaunch draft or a screenshot.**

### Deployment sequencing — mandatory

1. Finalize the actual legal forms, owner commercial decisions and supplier data-country appendix. Confirm first district's procurement signature authority and electronic-signature acceptance. Do not use draft placeholders.
2. Review the SQL against the exact connected hosted schema, existing `safebus_private.current_user_role` and PostgREST pre-request, Storage/Realtime policies, approved migration manifest, and protection against direct column flag changes.
3. Rehearse in an isolated **development** project with disposable synthetic district accounts. In a protected local transaction validate migrated existing tenants remain active, newly created tenants are locked, and platform/admin/signer authorization is correct.
4. Apply the schema through the existing protected release process **before** publishing the web/Netlify files. The new frontend and billing handler rely on the new RPC contract and must not be deployed against an old database.
5. Verify remote staging on signed test accounts, without entering real student, guardian, driver or customer contract data. Ensure existing tenants' operations continue and all endpoints for a new district fail closed.
6. Collect human approvals and customer-specific signed versions. Do not enable final activation by editing the protected release control from a dashboard.
7. Keep a private executed-document copy and authenticated retrieval plan for customer records. The initial implementation stores full immutable text and signature metadata, but **an executed PDF, human identity proof and independently delivered receipt are not yet certified**. If a district requires an accredited e-sign platform or PDF certificate, do not substitute the in-app signing flow without its approval.

## Verification checklist

- Role-neutral invitation email unchanged, driver/guardian native handoff unchanged.
- First tenant admin reaches contract page after password + MFA, never automatic billing.
- Only tenant admin sees signer-request status; only platform can issue/verify/countersign/activate.
- Officer identity and actual procurement delegation checked outside the browser; typed title is not authority evidence.
- All eight final documents, exact signed digest, immutable version, server-time event, one-time token; old/forwarded/expired/replayed tokens fail.
- District A cannot fetch/sign/review district B package by altering URL or request body.
- New district: Auth/MFA works but authenticated REST, RPC, Storage, Realtime, Netlify billing and direct Stripe checkout deny until actual activation.
- Existing active tenants: no retroactive lockout; existing invoices/price/trials unchanged.
- No document text, token, signer email, location or secret in Netlify logs, analytics or public repository.
- Failed provider delivery: token is revoked and no signed status is claimed; retry requires a new verified request.
- 320/375/390/430px, keyboard focus, semantic tabs, reduced-motion, screen-reader labels, large-text wrapping.
- Confirm actual signatory can access a complete original copy and that executed-evidence retention/receipt workflow meets district requirements before any legally operative signing.

## Existing documents

Use `docs/governance/phase-3/business-pack/` as the **draft** source. Individual district final terms are composed separately as a versioned package; do not silently publish the public drafts or copy actual signatures/student records to GitHub.

Legal sources for review: [Alberta OIPC service providers](https://oipc.ab.ca/resource/popa-guidance-service-providers/) and the Electronic Transactions Act. District procurement officers may require their own electronic signature service or approved agreement form.

**Release verdict:** Engineering implementation prepared; production not installed; signature enforceability and commercial launch not approved.

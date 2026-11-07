# SafeBus online MSA + DPA — integrated clickwrap implementation

**Engineering status:** PR #405, branch `feature/district-agreement-onboarding-20261107`.
**Legal status:** The current business-pack contract files are DRAFTS. No final agreement has been published or accepted, and this PR does not itself create approved contractual terms.
**Deployment:** Pending migration and protected release. Do not infer production migration execution from CI.

## Simple tenant journey

1. Platform creates a school authority through the existing invitation wizard.
2. Invited tenant administrator activates the account and completes existing MFA.
3. Tenant administrator opens `/admin/onboarding/agreements`. The platform automatically assembles the current approved, versioned, eight-document contract set if one was published.
4. Tenant administrator reviews/downloads the full MSA, DPA, Order Form, Security Schedule, SLA, Acceptable Use, Return/Destruction, and Supplier Disclosure, then enters full legal name and official title.
5. Three explicit affirmative declarations: authority to bind the district, consent to electronic records, and intent to accept the *complete identified package*. Click `Accept MSA, DPA and all incorporated schedules`.
6. The tenant- and session-scoped, MFA-protected Supabase RPC atomically validates the current hash/version, stores exact eight-document JSON snapshots, actor/session/email/name/title, server timestamp and receipt hash, and marks the package executed. Retries return the same receipt for the original signer; another actor cannot create a second signature.
7. District administrator downloads a multipage, on-demand executed PDF generated only from the private immutable receipt record (not a public asset), and can retrieve historical executed receipts in Settings → Agreements.
8. District administrator continues to existing Stripe billing and setup. Service-role billing functions verify contract execution for newly created tenants before initiating any Stripe action; database triggers reject transportation records written for new tenants without an executed agreement.

**No officer invitation, external signing, second signer, or SafeBus countersignature workflow.** The authenticated tenant administrator is the business-designated district representative, and their explicit authority attestation is recorded.

## Platform publisher

`/admin/agreements` is restricted to the active platform super-admin with MFA. Upload each independently finalized, approved text version as Markdown; the database stores it immutably with a server-generated SHA-256. Choose one version for each of the eight mandatory document categories, confirm review/approval, and publish a revisioned catalog. Missing, draft-marked or placeholder-bearing text is rejected. Only a published catalog can be offered to district administrators. Changes create a new revision and invalidate attempts to accept an older *unsigned* package. Historical executed packages are never overwritten.

The order form must accurately specify the approved price, bus-count terms, billing interval/selection rules, tax treatment, contract term and renewal. If these are customer-specific, **the business must finalize them or the issuance workflow must be extended to create a complete customer-specific order** before publication; don't silently use current Stripe catalog values or draft placeholders as contractual prices. This release supports a finalized standard published package.

## Safeguards and rollout

- Signer must have an active, tenant-bound `tenant_admin` profile, verified active Auth session and MFA AAL2. Driver, guardian, transportation admin and platform admin cannot sign a district's contract.
- Service-role billing checkout/portal checks and SQL transport-write triggers apply only to school authorities created after the migration. Existing active customers are grandfathered to prevent accidental operational lockouts; they can review and accept voluntarily.
- Existing Netlify onboarding functions check the same server-authoritative agreement requirement **before sending driver, guardian, additional administrator, or bulk invitation emails**. An unsigned new authority cannot receive misleading invitations while write gates deny their records.
- Platform publication is an affirmative owner approval; UI/software cannot certify the legal validity of a term, tax status, PIA, supplier DPA, insurance representation, procurement delegation or statutory applicability.
- Store proof inside restricted Supabase tables with RLS and privileged functions, never in GitHub or a public storage bucket. PDF exports are generated from immutable stored source with hashes; the original UTF-8 contract text remains canonical.
- Schema migration remains in `supabase/migrations/pending`. Run migration replay, RLS/RPC-negative tests, frontend tests and hosted smoke, then deploy through the existing controlled release pipeline. Do not apply a migration merely because the frontend builds.
- The actual business pack MSA presently says contracting requires two signatures; its final approved clickwrap version must be revised to explicitly offer the terms for acceptance by a district administrator without provider countersignature. Do not publish the old draft as final.
- Formal liability caps, insurance, tax, pricing, notice address, supplier/country matrix and district-specific procurement/PO rules need genuine review before using the signing flow with real school districts.

## Important boundary

**Engineering completeness is not commercial authorization.** The platform can implement the complete acceptance-and-receipt flow while initial agreement publication remains disabled until factual, customer-ready text exists.

New code and migrations are part of PR #405; no automatic merge, Stripe configuration change, supplier approval, or legal representation is implied.

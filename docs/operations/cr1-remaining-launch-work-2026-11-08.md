# SafeBus CR1 — remaining launch work and final acceptance queue

**As of:** November 8, 2026 (America/Edmonton)  
**Disposition:** NOT APPROVED for real school-authority operation. This is an execution tracker, **not** a new release or legal sign-off.  
**Product boundary:** School authority/district manages transportation. No individual school-admin account. Guardians see assigned bus status; drivers operate assigned trips.  
**Owner test sequencing:** Complete engineering, supplier/business decisions and protected changes first. Defer physical Android, real FCM and live Resend delivery to **one consolidated final acceptance phase**.

## Verified progress — do not confuse code with customer approval

- PR #414 generic pickup/drop-off external email code is merged. [Protected Netlify source verification](https://github.com/Davinder498/SafeBus-GLM/actions/runs/42543503884) passed against published commit `6ae32d43665e2fdf51ee6321dbe9a2e62db8ca03`. It **does not** establish live provider delivery.
- The separate Firebase provider-visible generic-push code was deployed as v7 ([protected run](https://github.com/Davinder498/SafeBus-GLM/actions/runs/42533721182)). Historic exposures and physical Android verification remain separate.
- District electronic MSA/DPA onboarding structure, driver/guardian invitation terms, role/MFA controls and automated UI/SQL tests exist. The **eight-document district contract package is a draft, not a published offer**; neither student transport processing nor a pilot has been approved.
- Current readiness records: `privacy-readiness.json`, `map-readiness.json`, `operations-readiness.json` = `not_approved`; `pilot-authorization.json` = `not_authorized`. **Never modify an approval to force a release.**

## Finish order

| Workstream | Work that can proceed without physical or live-provider tests | Hard dependency for sign-off | Evidence/source |
| --- | --- | --- | --- |
| 1 — Source/disclosure consistency | Merge PR #416 after CI; align active guardian notices, privacy-impact assessment and supplier ledger. Automated disclosure consistency must stay green. | Business-owner public-notice review; published notice deploy separately observed. | PR #416; `tests/release/guardian-disclosure-consistency.test.mjs` |
| 2 — Auth and tenant isolation | Finish isolated positive/negative API/session tests, including revoked-session refresh and already-open Realtime connections; preserve district/guardian/driver scopes. Do not fake signed tokens or alter live identities. | Real signed-session security acceptance before customer data. | `docs/qa/commercial-security-remediation.md` |
| 3 — Operations/maps | Review scheduled monitoring gaps, redacted alert routing, error-rate thresholds, Geoapify key/quotas and provider outage fallback. Keep destructive retention disabled until its legal/technical gate passes. | Owner-approved hours and escalation, account/quota evidence, observed monitoring and required drills. | `docs/operations/launch-closure-evidence-2026-11-06.md`, `operations-readiness.json`, `map-readiness.json` |
| 4 — Contract/supplier/privacy | Finish real supplier-contract/entity/country/retention evidence (Supabase, Netlify, Resend, FCM, Geoapify, relevant billing services); reconcile district processing instructions and cross-border notification metadata. | Account-specific supplier acceptance and authorized school-authority purposes; applicable PIA/legal review. | `docs/governance/phase-3/supplier-approval-ledger-2026-11-06.json`; `phase-3/business-pack/pilot-contract-signoff-2026-11-07.md` |
| 5 — Commercial package | Resolve corporate/trade-name and notices, taxes, Stripe tax configuration versus CRA registration, actual monthly/annual per-bus pricing, trial terms, insurance/liability, SLA/support and public-authority payment methods. Keep temporary Stripe prices unchanged until owner decision. | Explicit business-owner and customer-specific choices; authorized district signature/accepted order. | `phase-3/business-pack/owner-decisions.md`, `master-services-agreement.md`, `data-processing-agreement.md`, `order-form.md` |
| 6 — Pilot/release | Complete preflight, validated production migration state, accepted privacy/map/operations gates, role-safe customer onboarding and district clickwrap publication **only after** authorized decisions. | Human approval for protected release, actual customer district authority, pilot-specific scope and approvals. | `.github/workflows/release-production.yml`; `pilot-authorization.json` |

## Consolidated final acceptance phase — intentionally deferred

Perform after the preceding implementation and business controls are ready, with approved synthetic identities and no unauthorized school records:

1. **Actual Android devices:** driver foreground/background permitted tracking, 5-second configured GPS collection under real OS/battery conditions, pause/end, offline recovery, notification permissions and revocation; guardian bus-only map and privacy-safe lock-screen push.
2. **Provider emails/push:** synthetic pickup/drop-off events through the actual production delivery chain; confirm the Resend subject/text/HTML contain only generic messages and the authenticated inbox retains detailed authorized content; test FCM similarly. Verify recipient opt-ins, revocation and failure/retry behavior. Do not claim real delivery from mocked HTTP tests.
3. **Authenticated journeys:** district invitation/password/MFA, full clickwrap after legal publication, delegated transportation admin, assigned driver, linked guardian, tenant isolation and denied stale sessions; controlled Stripe subscription lifecycle and invoicing/tax where financially authorized.
4. **Operational field run:** staged route/bus/ETA flows, signal loss and GPS staleness, Geoapify provider failure and recovery, alert escalation, retention/holds behavior without unauthorized destructive execution, on-call procedures and security incident tabletop.
5. **Readiness decision:** evidence references and human approvals on the exact release; no fabricated sign-off, blanket supplier-country claims or automatic launch based on source CI alone.

## Rules for further changes

Do not enable a live school authority, publish draft district agreements, charge test payments, send real student data to vendors, bypass production environment gates, enable destructive retention, or promise unmeasured fleet capacity. Retain historic privacy findings as dated evidence, while keeping **current** public claims consistent with deployed source. Any real-world acceptance remains separately marked pending until the final phase is carried out and evidenced.


## November 8 owner decisions — restricted contact information

The owner reports GST/HST registration effective **2026-11-08**, registered SafeBus trade-name status under Sachman Gold Inc., and **info@safebus.kids** for formal/legal contract notices. The owner supplied a private mailing address and explicitly prohibited its public display: **do not place the mailing address in public GitHub, the website, public privacy policies or shared unsigned templates**. Populate restricted executed contracts only where required. Independently validate corporate/CRA documents privately before signing.

The owner left final monthly/annual unit prices **undecided** but selected **GST/HST included in future agreed prices**. Keep the two current temporary Stripe prices unchanged. Stripe's Canada Tax registration was observed active from **2026-10-23**, earlier than the owner's reported CRA November 8 date; active subscription automatic tax is now enabled but the paid Nov 7 invoice's was disabled. Resolve registration effective-date treatment, customer tax jurisdiction, inclusive price, future invoices and existing subscriptions with finance review before touching live billing. The owner will purchase insurance later and reconfirmed Monday–Friday **08:00–17:00 Alberta** support; unstaffed absence/holiday escalation remains open. All readiness approvals and consolidated physical/live-provider testing remain deferred as already planned.


## Future inclusive-price checkout guard

A newly authorized Stripe price that explicitly has `tax_behavior=inclusive` will now generate Checkout with `automatic_tax.enabled=true`, using the verified customer billing address to calculate the applicable tax *within* that inclusive amount. It does not change the existing temporary `unspecified` prices, Stripe account Tax settings, old live subscriptions or historical invoices. An already-open Checkout session for the same inclusive price is only reused when it already has automatic tax enabled; otherwise the existing safe expiration/recreation path is used. Exact inclusive prices, the earlier Stripe/CRA registration-date mismatch, discount and proration semantics, and first live paid invoice verification remain subject to final authorized acceptance.


## November 8 consolidated authentication follow-up

A read-only current BusSafe catalog review confirmed: public privileged `SECURITY DEFINER` routines have **zero anonymous execute grants**, the current authenticated callable count is **162**, the `authenticator` pre-request active-session hook is installed, and the previously flagged bus create/update functions and announcement-admin helper no longer contain the obsolete direct `school_admin` role allowance. This corrects the dated November 1 review's unresolved source assumptions; it does **not** establish positive/negative cross-authority test outcomes or close Point 5. See [current catalog reconciliation](../qa/security-definer-initial-audit-2026-11-01.md).

A separately scoped code change now binds asynchronous password changes and invitation activation to the current account/session before mutation, with synthetic sign-out and account-switch regression tests. This protects against stale client Auth results but is not proof of hosted signed Auth, Realtime or physical device acceptance. See [account-session mutation hardening](auth-client-mutation-race-2026-11-08.md). Maintain the owner's consolidated PR strategy and keep business/supplier/pilot gates pending until real evidence is accepted.


## Live district agreement and read-only security reconciliation — November 9, 2026

Unlike earlier implementation plans, the district agreement schema is **already installed** in production: five private tables with RLS and no client SELECT, a service-only billing gate, all 35 transport-write triggers and the user-facing agreement RPCs. An aggregate-only query found 3 existing authorities; 1 uploaded document version, **no published eight-document catalog**, no issued package, no signed receipt and no new tenant flagged for agreement. Preserve historical documents, but do not rerun the installed migration merely to resolve old “pending” wording. Finalize customer-ready documents and obtain owner/legal/supplier/insurance/price approvals before any platform publication or pilot.

Three reviewed read-only, explicit ROLLBACK SQL checks were run on the current production database without fixture writes, external sends or private-row output: `commercial-security-existing-database-readonly.sql` **PASS** (missing identity, malformed session, RLS catalog and API denial); `guardian-existing-database-readonly.sql` **PASS** (4 anonymous/no-identity RPC denial assertions); `admin-trip-reporting-existing-database-readonly.sql` **PASS** (available platform, tenant-admin, driver, guardian scenario checks; one tenant-admin scenario skipped due to lack of active session). These are transaction-local claim/role simulations, **not real signed JWT or Realtime admission testing**; they do not establish complete district isolation or mark the Point 5 gate approved.

The integrated code batch also corrects missing-agreement-RPC errors, stale document upload selection, and exact UTF-8 executed-archive downloads. No production SQL/Auth, Stripe, customer invitations, document publishing, tenant records or release-readiness gates were modified.


## November 9 — owner price decision CLOSED; live Stripe complete

The owner explicitly approved **CA$1.99 per active bus per month** and **CA$20.29 per active bus per year**, including applicable GST/HST. This **supersedes the November 8 “temporary/undecided” price language above**. The original two LIVE Stripe prices were changed in place to `tax_behavior=inclusive` and verified by fresh reads. Existing price IDs/subscriptions were not migrated, and historical invoices remain untouched. The code now rejects price amounts different from 199/2029 CAD cents and excludes tax-unspecified/exclusive prices from approved buyer options. The platform pricing form reflects the locked rates; last active approved billing prices cannot be archived. The commercial pricing decision is complete and must not reappear in the open-issues list.

Outstanding independent obligations: private CRA evidence and October 23 versus November 8 tax-start reconciliation; applicable province/exemptions, actual post-change invoice and lawful historical handling; the customer order/interval and approval; and the unrelated supplier/insurance/operational launch gates. **Do not re-open approved prices or alter tax registrations without a new owner decision.**


## Final November 9 trial/invoice policy engineering batch

The business owner approved a **single 14-day trial with a payment method collected during signup and automatic monthly/annual billing afterward**, and also **platform-approved invoice/PO arrangements**. The original Stripe Checkout code already enforces the card path. An additional controlled invoice workflow now enables a tenant-admin request; a platform super-admin with MFA approves that exact selection, bill-to contact and invoice payment window (14/30/45/60 days); then only the tenant administrator may activate the `send_invoice` subscription. Neither submitting nor approving a PO creates a financial obligation. A first-time PO authority receives the same one 14-day trial and a manual-pay invoice when it ends; previously used trials aren't repeated and activation may invoice immediately. Approved invoice cancellation/resumption is available without modifying unrelated legacy send-invoice subscriptions. Server-side Stripe history, customer ownership, idempotency and Supabase audit/projection are required; client-only approval is not trusted.

Business decision is **CLOSED** for the trial rule and available payment methods; exact due days are explicitly approved per school authority, not globally assumed. Real customer order acceptance, provider invoice delivery acceptance, other contractual clauses, tax effective-date reconciliation and general commercial launch gates remain separate. All application and document changes are in the same PR, with synthetic test coverage and no production customer mutation.

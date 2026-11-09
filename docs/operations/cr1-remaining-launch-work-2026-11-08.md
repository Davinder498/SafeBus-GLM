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

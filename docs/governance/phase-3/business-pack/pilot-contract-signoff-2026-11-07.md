# SafeBus — Pilot Contract, Supplier and Insurance Sign-off Pack

**Prepared:** 2026-11-07, America/Edmonton  
**Status:** PREPARED FOR OWNER / SCHOOL-DISTRICT REVIEW — **not signed, not approved, not permission to launch**  
**Operator:** Sachman Gold Inc. (SafeBus product)  
**Customer model:** Alberta school authority manages the district's transportation, including routes, buses, drivers, guardians and students. **There is no independent school-admin account or authority in the SafeBus product.**

## Purpose and decision boundary

Use this as the **last-mile commercial evidence checklist** alongside the existing [MSA](master-services-agreement.md), [Order Form](order-form.md), [DPA](data-processing-agreement.md), [Security Schedule](security-schedule.md), [SLA](service-level-agreement.md), [Data Return and Destruction Schedule](data-return-destruction.md), [supplier disclosure](supplier-disclosure.md), and [owner decisions](owner-decisions.md). Do not draft a second set of binding agreements from this worksheet or assume the drafts have been executed. This document is not legal advice.

The [November supplier review](../../privacy-supplier-launch-review-2026-11-06.md) and [supplier evidence ledger](../supplier-approval-ledger-2026-11-06.json) list account-specific items; **all actual supplier decisions remain pending**. Public DPAs can be incorporated into existing service terms; a separate signature is not automatically required for every vendor. Record the **correct account entity, applicable terms/version and acceptance mechanism**, not an invented countersignature.

Alberta's POPA applies to school boards and requires public bodies to assess their service-provider arrangements. Whether a PIA must be prepared/submitted depends on the prescribed circumstances and the school authority's assessment; the vendor's business PIA draft is not its approved PIA. Relevant official guidance: [OIPC service-provider contracts](https://oipc.ab.ca/resource/popa-guidance-service-providers/), [POPA PIA guide](https://oipc.ab.ca/resource/popa-pia-template-completion-guide/), [Alberta public-body privacy management](https://www.alberta.ca/privacy-management).

**Evidence rule:** Keep corporate registration documents, insurance certificates, vendor account screenshots, tax records, contract versions, customer identifiers, signed orders, legal advice, names and contact details **out of GitHub**. Store them with the owner in restricted company records and put only non-sensitive evidence references in the formal privacy/supplier approval process. Do not add a `status=approved` entry without actual competent human acceptance.

**November 8 follow-up:** The [public-source supplier DPA, insurance and district contract review](supplier-dpa-insurance-contract-review-2026-11-08.md) confirms provider-by-provider incorporation/signing routes and online quote options. This does **not** approve any business account or create insurance coverage. The owner has confirmed live Stripe prices are **temporary and must remain unchanged**; binding Order Form pricing is still pending.

## 1. Decisions the business owner can make before selecting a school district

| Decision | What must be decided or checked | State |
| --- | --- | --- |
| Contracting identity | Verify legal corporation and signer; confirm whether SafeBus trade-name registration is complete and how invoices/contract names read | Pending independent evidence |
| Public legal-notice channel | Approve official service and legal mailing address and whether `info@safebus.kids` accepts formal contractual notices | Pending |
| Commercial price | Approve exact monthly/annual CAD per active bus, billable reserve/replacement rules, discounts and effective dates; current Stripe catalog is *observed*, not owner sign-off | Pending |
| Trial and cancellation | Approve 14-day first-customer trial eligibility, first charge, service term, cancellation and renewal messages; an implemented default is not a contractual entitlement | Pending |
| Tax | Owner says corporation is **not currently CRA GST/HST registered**, with future registration intended; confirm registration duty/threshold and reconcile Stripe's active Canadian Tax registration entry *without changing tax settings in this review* | Pending finance review |
| Payment alternatives | Determine when customer can pay automatically, when an approved public-authority PO/`send_invoice` process applies, and whether a proposed net-30 term will be offered | Pending |
| Service/support | Confirm owner-selected Mon–Fri 8:00–17:00 Alberta hours, holiday/absence coverage, P1 escalation route and whether any 24/7 obligation is possible (do not promise one by default) | Pending operational coverage |
| Insurance and liability | Get requirements/quotes and choose acceptable general, professional technology and privacy/security risk coverage and contract caps; **no blanket statutory coverage amount is inferred** | Pending |
| Service performance / credits | Set measurable availability, latency, GPS freshness, notification response and credits only where evidence supports each claim; keep unsupported service levels blank | Pending |
| Supplier acceptance | Review each enabled supplier account's data contract, purpose, countries, logs/backup/support access, incident handling and downstream access | Pending |
| Privacy leadership | Owner selected themself as Privacy Lead; identify a capable alternative or documented coverage limitation and run access/request/breach tabletop | Pending |
| Record lifecycle | Confirm legal retention exceptions and customer instructions, data export/return method, provider backups/held records and safe disposal activation; dry-run != approved deletion | Pending |

**Insurance is a negotiation and risk-transfer decision**, not an assertion that a particular policy or minimum is required universally by Alberta law. An actual district procurement package may prescribe types and minimum limits, endorsements or certificates; record its requirements and request a licensed insurance broker's explanation for suitability before quoting or signing.

### Insurance and liability review (do not fill figures without evidence)

| Exposure | Coverage / contractual question to assess | Evidence requested |
| --- | --- | --- |
| General commercial liability | What bodily injury/property damage risks could arise in installation, support or customer interaction? Does the district demand specific CGL coverage? | Actual policy wording/certificate and district procurement instructions |
| Technology errors & omissions | Coverage for failure of software, data delivery, ETA/location availability and professional services? What are waiting periods, exclusions and claims-made dates? | Broker quote/policy terms and insured activities |
| Cyber/privacy liability | Incident response, unauthorized disclosure, notification, breach counsel, third-party claims, network liability and exclusions for minors/contracted data? | Policy summary and exclusions; approved handling procedures |
| Contract indemnities | Which legal claims are covered and by whom, including IP and unlawful processing instructions? What is the defence/settlement process? | Negotiated MSA rider, insurer alignment, accountable legal assessment |
| General liability cap | Select amount and basis (e.g., fees or negotiated sum); state exclusions, claims aggregation and survival. Do not default to zero or unlimited. | Owner decision and accepted contract |
| Privacy/security liability cap | Separate risk allocation/cap if negotiated, consistent with the accepted DPA and non-excludable duties | Owner decision, legal/risk assessment and contract |
| Cyber events and service interruption | Are GPS/notification outages or platform failures excluded? Can contractual SLA remedies be sustained? | Policy and accepted SLA/operational evidence |

Do not represent SafeBus as “insured”, “SOC 2 certified”, “24/7 staffed”, or holding any particular coverage limit until evidence establishes it.

## 2. Supplier-by-supplier evidence intake — first wave

This is **not** a vendor approval or a statement that all flows are Canada-only. Collect the applicable terms and account-country evidence privately; supplier contracts may consist of online terms and incorporated DPAs.

| Supplier | Ask the account owner to verify | May close only when |
| --- | --- | --- |
| Supabase | Service account/legal party and DPA; Canada Central project; Auth/storage/backups/logs/support access and subprocessor countries; retention/incident/security terms | Account terms, primary and other processing locations, data categories, and decision owner recorded |
| Netlify | Actual legal account/DPA; function, CDN/request, build and log locations; expiry, support access, privacy/security incident process | Written/portal evidence matches enabled use of web/functions/operational logs |
| Resend | Account party/DPA; recipient/content and delivery metadata; US processing, expiration, tracking and third parties; request/incident assistance | Actual sending service, recipient impact and expiry recorded; one delivered operations alert is *technical* evidence only |
| Zoho Mail — business correspondence | Confirm mailbox security, ordinary business-email scope, service terms, account data centre vs Canadian MX routing, retention/trash/backup, support access and procedure for unsolicited personal information | **Not automatically a transport-data subprocessor or district DPA publication blocker.** Seek a separate Zoho DPA only if the actual account processing, law or accepted district contract makes one necessary. |
| Geoapify | Actual API account/terms/DPA applicability; map tile/IP/viewport/referrer request processing, countries and log handling; project key lifecycle, quota/SLA and outage support | Map provider privacy, operational boundaries and selected pilot plan accepted |
| Google FCM (conditional) | Actual Firebase project and terms; opt-in push payload/token scope, global support and deletion timelines; physical Android flow | Approved notification use and supplier path; device acceptance is still separately deferred |
| Stripe (paid scope) | Seller/entity/terms, billing-only data, tax and financial records, countries, allowed billing practices; first paid invoice/receipt evidence | Actual contracts and owner finance decisions accepted; never include student roster or raw GPS in billing |
| GitHub / recovery | Customer-data scope of artifacts, artifact retention/countries, access/key handling, expiry and incident response | Restricted recovery/CI evidence controls documented |

See [current supplier evidence ledger](../supplier-approval-ledger-2026-11-06.json) for all categories including unapproved additional error telemetry. If a supplier feature is disabled, document it as **not used** with evidence rather than inventing a subprocessor approval.

### Supplier acceptance checklist (repeat for each *enabled* vendor)

- [ ] Actual vendor legal entity, current business account holder and contracting route verified in restricted storage.
- [ ] Applicable terms and DPA version **and actual incorporation/acceptance mechanism** recorded.
- [ ] Purpose and minimal categories of SafeBus information, including network metadata and children/driver data where relevant, reviewed.
- [ ] Primary hosting, CDN, backup, log, support and downstream countries verified; residual unknowns assigned a reviewer.
- [ ] Processing restrictions, confidentiality, personnel access and incident notification/cooperation assessed against customer DPA.
- [ ] Retention, deletion, backups, device copies and data-return assistance assessed for the enabled flow.
- [ ] School-district notice and foreign-processing/authorization decisions recorded when applicable.
- [ ] Review owner, decision date, risk exceptions, renewal/review trigger and **non-secret evidence reference** recorded outside the public codebase.
- [ ] Only then submit the relevant evidence to `privacy-readiness.json` through the protected accountable approval process; don't write a placeholder decision.

## 3. Customer-specific school-district contract gate

The following is necessary **after a real authorized school district** is identified. Individual schools have no separate SafeBus tenant administration. A district contact's email alone is not proof of public-body delegation or of a guardian's right to view each child.

1. **Authority and procurement:** Establish the school authority's legal identity, approved purchasing channel, budget/PO requirement and signing delegation. Confirm whether tendering, insurance minimums or standard public-body clauses apply.
2. **Processing purposes:** School district authorizes transport student/guardian linking, route and stop assignments, assigned driver mobile GPS while the trip is active, appropriate retention and notification recipients. Exclude child-device tracking, sensitive school records and unsupported future features.
3. **Public-body PIA:** District privacy officer/head or delegate determines whether the POPA PIA preparation and submission triggers apply; reviews vendor PIA/data-flow materials and the contractual safeguards. Record the actual decision, not “PIA approved” by SafeBus.
4. **Foreign processing:** District receives the actual enabled supplier/country matrix, approved notices, subcontractor change route, and incident/data-access assistance arrangements.
5. **Signatures:** Complete and execute the MSA/Order Form/DPA/Security Schedule/SLA/Return & Destruction schedule with exact versions, price, term, trial, named notices, accepted limitations, insurance and purchasing requirements. Do not put signed copies in Git.
6. **Go-live acceptance:** Obtain pilot scope authorization, signed-device and real-role acceptance (where not deferred), pricing/tax/receipt decisions and release gate sign-offs before processing real student data. Previously deferred controls must have documented lawful scope/mitigations rather than being falsely marked passed.

## 4. What this worksheet does **not** close

It does **not** approve vendor contracts, privacy law applicability, a PIA, customer processing, cyber insurance, price, GST/HST, support coverage, SLA, signed orders, approved key/quota plan, destructive retention, physical Android use, leaked-password protection or commercial launch. The protected `privacy-readiness.json`, `operations-readiness.json`, `map-readiness.json` and customer-activation records remain the authority for release gates and are not changed here.

**Recommended next actions in order:** owner verifies corporate signatory/trade-name and insurance requirements, owner or authorized vendor account holder gathers first-wave supplier evidence, owner resolves GST/HST/Stripe inconsistency, then the first school district negotiates its own terms and PIA with actual documents. Record concrete evidence privately; continue engineering monitoring without inventing approvals.

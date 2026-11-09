# SafeBus — Privacy, Supplier and Commercial Approval Gap Review

**Review date:** 2026-11-06 (America/Edmonton)  
**Release baseline:** `f2f3d367131dd0a1671b16befeda0f3c45e02bf4` (merged PR #400)  
**Overall status:** **NOT APPROVED** — evidence and owner/customer decisions outstanding  
**Intended initial customer:** Alberta public school authority (district-managed transportation; **no school administrator product role**)  
**Operator:** Sachman Gold Inc., using the SafeBus product name; business registration, DBA, insurance and signatory documents must be checked privately before execution

This is a sourced, internal **gap analysis**, not legal advice, a supplier signature, a customer contract, a privacy-impact-assessment approval, or a finding of compliance. It does not change approved data purposes, retention policy, billing, production credentials, RLS, or customer access. No personally identifiable records are copied into this file. Account-specific agreements and screenshots belong in a restricted business evidence store; use non-secret evidence references here.

## Executive finding

The repository already contains a substantive privacy and business pack and a previously reviewed supplier inventory. The major work now is **account-level substantiation, owner decisions, customer-specific authority, privacy sign-off and execution**. Do not generate new generic MSA/DPA/SLA copies in place of the existing drafts. Never translate “public terms reviewed” into “account accepted/approved”, or “Canadian database” into “Canadian-only data processing”.

The private-supplier review must include every **enabled data flow**; record conditional providers separately rather than pretending every vendor is always a transport subprocessor. A pilot can launch only under the exact accepted scope and after the required evidence gates pass. An owner-selected policy threshold is not a statutory rule or provider guarantee.

## 1. What is established, and what is not

| Area | Established evidence at review | Still requires evidence or decision |
| --- | --- | --- |
| Product and roles | SafeBus tracks active buses for assigned drivers and linked guardians; school districts operate transportation. Customer-owned transport purposes remain separate from SafeBus billing/support activity. See [role and law map](phase-3/legal-role-analysis.md) | Customer public-body identity, authority to delegate processing, approved transport purposes, guardian authority, customer role/PIA decisions |
| Business identity | Sachman Gold Inc. and SafeBus confirmed by owner, support/privacy contact `info@safebus.kids` | Corporate registry evidence, DBA use/status where applicable, mailing address, legal notice channel, actual signer |
| Supabase core | Connected BusSafe production project `ckrkfylsyihwouvesypm` reports `ACTIVE_HEALTHY`, primary region `ca-central-1` (Canada), PostgreSQL 17 | Account-level DPA and legal entity; backup/storage/log/support regions and expiry; specific cross-border flows; appropriate administrative access |
| Notification and support email | Resend operational alert accepted and a matching message was received in Zoho by the owner; this is proof of one inbox event, not all email delivery or supplier terms | Resend account terms/subprocessors, email content/log retention, recipient payload review; Zoho account data centre, DPA, backup/trash limits, support access |
| Geoapify | Two project keys exist; restricted website key uses an allowed website Referer; production map screenshot showed working tiles and attribution | Signed-in provider account terms, processing/log details, published web-vs-mobile key confirmation, traffic/quotas/SLA and approved Android-specific acceptance |
| Hosting and other suppliers | Netlify functions/scheduled monitoring exist; Stripe live SafeBus account exists; FCM is in the mobile notification design | Account-specific terms, region/access/retention and purposes for Netlify, Stripe and FCM; Google Play notices; vendor security and incident terms |
| Data retention | Owner selected routine GPS 30 days; selected operational records 395 days; terminal notification records 90 days, subject to holds/authority requirements. Dry-run observations passed | Protected destructive execution remains disabled; complete provider/backups/device/export disposal evidence, legal holds, approval and field acceptance pending |
| Privacy program | Owner self-appointed Privacy Lead; support email selected; drafts exist for notices, requests, breach response and legal holds | Capable coverage/backup, monitored request process, tabletop outcomes, training and accountable approval |
| Commercial terms | MSA, DPA, SLA, order form, security and return schedule drafted under `phase-3/business-pack` | Price/tax/insurance/liability, support capacity, service/measurement targets, customer-specific signatories and executed documents |

### Legal/role decisions (before customer onboarding)

1. Confirm applicability of Alberta **Protection of Privacy Act (POPA)** to the particular public-school authority and its contracted service processing, and the **Access to Information Act (ATIA)** to records under that authority's custody/control. The school authority retains accountability for its decisions.
2. Assess applicable Alberta **Personal Information Protection Act (PIPA)** and, where relevant, federal **PIPEDA** for SafeBus's own commercial billing, support, and other personal-information activity. Do not label all school records private-sector records or treat all business-contact information as exempt.
3. Document necessity, authority and limits for student/guardian links, assigned-driver GPS during active trips, notification payloads, IP/device metadata, QR workflows, operational audit and emergency/incident handling.
4. Confirm whether and how the **public authority's PIA** is required, reviewed, submitted or approved under the current law/regulations and the authority's own policies. The existing SafeBus PIA is an **unapproved vendor/business draft**, not a completed school-authority assessment.
5. Make actual customer-specific cross-border disclosure/notice/approval decisions based on verified supplier countries and enabled flows, not a blanket Canadian-only representation.

Primary sources to re-check at sign-off: [OIPC POPA service-provider guidance](https://oipc.ab.ca/resource/popa-guidance-service-providers/), [Alberta POPA overview](https://www.alberta.ca/about-the-protection-of-privacy-act), [Alberta PIPA organization responsibilities](https://www.alberta.ca/organization-responsibilities-for-protecting-personal-information), and [Canadian federal PIPEDA overview](https://www.priv.gc.ca/en/privacy-topics/privacy-laws-in-canada/the-personal-information-protection-and-electronic-documents-act-pipeda/pipeda_brief/). Legal interpretations require accountable review; these links do not substitute for a documented applicability assessment.

## 2. Supplier evidence matrix

**Legend:** `verified-project` means a bounded current technical fact; `public-terms-reviewed` means public materials were inspected earlier; `account-evidence-pending` means agreement/entity/country/retention evidence has not been accepted. **No supplier is approved by this table.**

| Supplier / enabled purpose | Evidence available | Decision still open | Priority |
| --- | --- | --- | --- |
| Supabase — database, Auth, functions, operational storage | `verified-project` for Canada Central primary region and health; public DPA/residency material reviewed | Contracting account/accepted terms, primary and backup/log/support/subprocessor countries, deletion and support access | **P0** |
| Netlify — web/CDN/functions and logs | Published SafeBus production site; public DPA/Trust Center reviewed | Actual account agreement, functions/CDN/log countries, log expiry, staff access, incident and security commitments | **P0** |
| Resend — invitation/recovery/notifications and alert emails | Fixed alert reached owner's Zoho inbox; public DPA reviewed; earlier US region observation | Contracting entity/DPA, email data/content retention and deletion, US flow, tracking settings, supplier onward processing | **P0** |
| Zoho Mail — business/support/privacy correspondence | Owner reports active `info@safebus.kids`; Canadian mail MX routing previously observed | Account's actual data centre and processing region, signed/incorporated DPA where applicable, support/trash/backup expiry, privacy intake controls | **P0** |
| Geoapify — map tiles and IP/viewport/referrer metadata | Restricted web key, visible functioning web map; public privacy policy reviewed | Processing locations, contract/legal basis, request log retention, unaccepted requests, paid SLA decision, project-wide quota evidence, Android key | **P0** |
| Google Firebase Cloud Messaging — opted-in mobile push | Android notification system exists; public Firebase privacy/terms reviewed | Actual project party/terms, push metadata/regions, installation token deletion, on-device notice and physical device acceptance | **P0 for enabled push** |
| Stripe — billing, invoicing, payments | Connected Stripe account named SafeBus in live mode; public processing terms reviewed | Actual account party/terms, billing-only payload check, card details boundary, retention and applicable countries, commercial pricing/tax decisions | **P0 if paid activation** |
| GitHub Actions and recovery evidence transfer | CI/release audit and encrypted archive workflow exist | Artifact retention/country, authorized recipients, restricted owner-copy/key custody, deletion, any included customer data | **P1** |
| Future error monitoring / analytics | No approved separate application-error vendor; sanitized internal application probes in `observe` mode | Decide whether a vendor is needed, then review privacy/terms/countries/safe payloads before onboarding | **Not authorized** |

**Required record per supplier:** business legal entity; contract version and how accepted; product/project ID (not secrets); business owner; categories/purposes; status `enabled`/`conditional`/`not-used`; countries for core data, request metadata, backup, logs, support and subprocessors; retention/deletion mechanism; support/incident notification and assistance; customer notice/authorization; decision maker; review date and confidential evidence references. An unsigned contract, a generic website and a primary database region are each insufficient on their own.

Applicable public materials: [Supabase DPA](https://supabase.com/legal/customer-resources/data-processing-addendum), [Supabase residency and transfers FAQ](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq), [Netlify Trust Center](https://www.netlify.com/trust-center/), [Resend DPA](https://resend.com/legal/dpa), [Zoho privacy and DPA route](https://www.zoho.com/privacy.html), [Geoapify Privacy Policy](https://www.geoapify.com/privacy-policy/), [Firebase privacy](https://firebase.google.com/support/privacy), and [Stripe DPA](https://stripe.com/legal/dpa). Revalidate applicability and version against **actual business accounts** before signing.

## 3. Commercial pack decision order

Do not change implementation or promises to match draft placeholders. Use the existing [owner decisions](phase-3/business-pack/owner-decisions.md) and [commercial pack](phase-3/business-pack/README.md) as the authoritative working drafts.

| Decision | Owner action/evidence | Blocking? |
| --- | --- | --- |
| Contracting identity | Verify Sachman Gold Inc., authorized signatory, legal/mailing address and SafeBus DBA presentation | Yes |
| Service scope | District-managed, assigned drivers, guardian bus-only map; pilot bus/tenant limits and enabled feature list | Yes |
| Price/tax/payment | Select annual CAD per-bus amount, billable reserve/replacement rules, tax registration status and lawful invoicing | Yes before paid sales |
| Insurance and liability | Confirm coverage, required policy, general/privacy liability caps and exclusions | Yes before contract execution |
| SLA/support | Approve measurable targets that operating evidence can support, incident definitions, holiday/absence coverage, remedies and escalation | Yes |
| Instructions and suppliers | Accept DPA processing appendix, data-country disclosure, supplier approval/change notification, public-body authority and the accepted data return schedule | Yes |
| Retention and deletion | Verify accepted schedule, legal holds, backup/device/export limitations, destructive-release approval and tenant-specific exceptions | Yes |
| Contract execution | Customer-authorized signer and signed MSA/Order Form/DPA/Security/SLA/return schedules; restricted copies, dates and evidence IDs | Yes before customer activation |

## 4. Safe working order — launch without pretending approval

**Track A — business owner, now:** review this matrix, verify registration/DBA status, signatory, official legal notices/contact, supplier account holders, support availability, price/tax/insurance/liability choices. Put private evidence outside Git; public status remains pending.

**Track B — supplier approvals, now:** obtain/verifiably record account-specific DPA acceptance and complete data-country/retention/incident fields. Ask vendors only for precise missing details; never claim a signature was obtained by reading a website. For supplier changes or new data flows, reassess notices and authority before activation.

**Track C — first school district:** identify its lawful authority/transport purposes, PIA decision, permitted recipients, customer instructions, contract representatives, approval of suppliers/countries, and signed data/operational schedules. Individual schools have **no independent SafeBus app administrator role**.

**Track D — operational and pilot acceptance:** preserve Netlify's successful six-check observation log and verified alert inbox receipt; continue documenting unresolved GitHub scheduling gaps and seven-day monitoring evidence. Keep Android physical acceptance and leaked-password controls deferred **only as owner decisions**, not falsely passed. Do not bypass commercial release's protected readiness checks.

## 5. Explicit non-approval decision

The following all remain **not approved**: `docs/governance/privacy-readiness.json`, `docs/governance/map-readiness.json`, `docs/governance/operations-readiness.json`, customer activation, supplier/cross-border authorization and general commercial launch. There is no executed customer agreement in the reviewed sources. This report supplies **review/evidence requests** only, not an approval ID, validity period, released evidence digest, vendor signature or actual negotiated SLA.

**Owner-facing next action:** work down the P0 supplier ledger, then resolve the MSA/DPA/SLA owner-decision worksheet. Once source documents and evidence are privately available, reconcile them here using **only non-secret references** and run the protected privacy and operations readiness checks before any approval attempt.

## Supporting machine-readable working register

The [supplier approval evidence ledger](phase-3/supplier-approval-ledger-2026-11-06.json) records each supplier's enabled/conditional purpose, bounded observations, required private evidence and explicit pending decision. It is a checklist and is **not** an alternate release authorization. The protected `privacy-readiness.json` gate is the only release-controlled privacy approval record, and remains `not_approved`.

## November 9 commercial update — approved negotiating caps, no insured status

The November 6 review's insurance/liability row was a historical open-issue
snapshot. Subsequently the owner approved proposed SafeBus Provider limits for
its initial-pilot MSA: general aggregate **greater of CA$25,000 or 12-Month
Fees** and privacy/security aggregate **greater of CA$100,000 or twice
12-Month Fees**, non-stacking and excluding liability prohibited by law from
being limited. The formal source is MSA section 8 and the matching Order Form;
no customer has accepted the proposed limits merely through this decision.

**Insurance quotations and purchase are deferred**, and **no policy or
coverage is claimed**. Customer-specific public-authority procurement,
indemnity/legal-risk assessment, supplier accountability and privacy/operational
release approval remain unresolved. Do not turn any protected release gate to
approved because these monetary terms have been drafted.

## November 9 follow-up — indemnification standard proposed, contract not executed

After the historical review above, the owner approved a proposed
**limited, fault-based SafeBus Provider indemnification** for covered
Provider-caused privacy/security third-party claims under the **greater of
CA$100,000 or twice 12-Month Fees** privacy/security aggregate cap and
unmodified, authorized-use SafeBus-software IP claims under the **greater of
CA$25,000 or 12-Month Fees** general aggregate cap. Covered legal defence
costs, agreed settlements and damages are included within, not added
to, the caps. SafeBus does not indemnify the school authority's independent
negligence, unlawful instructions or unauthorized changes. DPA duties and
legally non-excludable liability remain preserved in MSA §§8.1–8.5.

**Insurance quotations and purchase are deferred; no coverage is asserted**.
This is an owner-approved **business proposal only**: customer-specific
indemnity exceptions, procurement rules, financial risk, supplier evidence
and written school-authority acceptance remain unapproved. No live data,
contract publication or readiness gate is authorized by this update.

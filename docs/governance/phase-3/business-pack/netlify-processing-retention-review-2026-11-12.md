# Netlify processing and retention review — November 12, 2026

Status: source and supplied-document review; not a live traffic capture, legal sign-off or completed supplier approval. No production data was queried or changed.

## What actually passes through the hosting service

Supabase is the primary application database. Netlify also runs backend functions; describing Netlify as static hosting or metadata-only processing would be inaccurate.

| Path | Information processed | Evidence and limit |
| --- | --- | --- |
| Website delivery | Request IP, URL and network metadata; static application assets | `netlify.toml`; provider-side collection/expiry is not established by application source. |
| Invitations and onboarding | Account identity, recipient email, authority and role/invitation information; authenticated requests | `apps/web/netlify/functions/safebus-onboarding.mjs`; existing function source, not a new live invitation. |
| Guardian email worker | Recipient email and notification payload read from Supabase, including title/body and event time before rendering | `apps/web/netlify/functions/guardian-notification-email.mjs`; generic outbound pickup/drop-off text does not prove that the worker never receives detailed input. Application logging uses aggregate counters and fixed categories. |
| Billing and inquiries | Billing contacts, authority/subscription identifiers and inquiry contact/message fields | `tenant-subscriptions.mjs`, `invoice-billing.mjs`, `tenant-inquiry.mjs`; no reason to send transport rosters to Stripe. |
| Record export and retention cases | Authorized record export results, identifiers, preservation references and dates | `disposal-records.mjs`, `retention-cases.mjs`; these responses pass through Netlify even though records reside in Supabase. |
| Scheduled retention | Database work requests and aggregate counts; account disposal orchestration | `retention-lifecycle-scheduled.mjs`; source alone does not establish which destructive operations are enabled in production. |
| Executed agreement PDF | Authorized full receipt, common documents, customer Order Form and acceptance details | `district-agreement-pdf.mjs` in PR #442; proposed, not verified live. PDF response is `no-store`; this is not proof of provider-log or backup deletion. |

Configured function location was observed as CMH (Ohio, US East) on November 11. This establishes US function processing, not all CDN/log/support locations. Browser clients also connect directly to Supabase (`apps/web/src/lib/supabase.ts`); not every application record traverses Netlify.

## Supplied evidence

Owner supplied the Netlify DPA dated June 9, 2026 and certificate MMIND-25090201. Keep original documents in restricted business evidence storage, not public Git.

- DPA opening: incorporated into the applicable subscription agreement unless superseded; a separate countersignature is not automatically required. Actual company account identity remains to be recorded.
- DPA sections 6.2–6.3: at least 30 days' notice of new subprocessors and a qualified objection mechanism. This is not the same as a school authority's affirmative consent.
- DPA section 10.1: notification without undue delay and within 48 hours for the specified incidents affecting customer data. This provider commitment does not replace SafeBus's own actual-awareness notice obligations or change staffed support hours.
- DPA section 12: export at customer request/expense or deletion following termination, according to service capabilities and policies. It supplies no complete deletion deadline or backup-expiry timetable.
- Exhibit II describes logs retained online for 90 days and offline for one year, but is headed Enterprise Services. Applicability to Free legacy or Personal is unconfirmed; do not advertise those periods as verified SafeBus-account retention.
- Certificate: ISO/IEC 27001:2022 management-system certification, issued July 23, 2026, expires September 1, 2028, with additional ISO/IEC 27018:2025 controls. It is not SafeBus certification or a separate 27018 certification. Certificate contents reviewed; certification-body registry status not independently checked.

The current observed plan is Free legacy. The owner plans to upgrade to Personal; no upgrade or new entitlement is verified. Two Trust Center access-request attempts returned a submission error; no successful request is recorded.

## Decision and remaining work

The locked retention summary is a targeted evidence follow-up, not by itself a universal blocker to drafting, implementation, testing or the protected software rollout. Do not mark the whole supplier review approved merely because these documents exist. Assess customer-facing publication against actual processing, contractual requirements and truthful remaining exceptions; do not invent expiry dates or silently waive a customer's requirement.

SafeBus's retention schedule controls its handling of district records. Provider technical records, backups, legal holds and return/export copies need separate treatment. Deleting a row or terminating a hosting subscription is not proof of complete erasure across providers. An assisted-return completion report must distinguish returned records, completed deletions and retained exceptions with purpose and applicable expiry/trigger; unresolved periods must be identified, not replaced with a promise of immediate deletion.

Follow up only for plan-applicable log, backup and deletion periods and exceptions. This follow-up can proceed alongside final supplier-country/account reconciliation, tested assisted return, and protected agreement rollout. No production retention setting, readiness approval, customer acceptance or commercial launch authorization is changed by this review.

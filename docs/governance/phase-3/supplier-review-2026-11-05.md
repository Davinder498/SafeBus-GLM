# Supplier terms and data-flow review

**Reviewed:** 2026-11-05, America/Regina
**Status:** Public terms and enabled-flow review completed; account-specific evidence remains identified
**Service operator:** Sachman Gold Inc. / SafeBus

## Meaning of agreement completion

A separate signature is not automatically required for every supplier. Some DPAs
form part of existing service terms. Keep the applicable version, actual account/
contracting entity and any superseding agreement in restricted business records.
Public terms establish the incorporation mechanism; they do not prove which
entity accepted an individual account's terms. This review neither signs a new
agreement nor invents missing customer/provider approval.

| Supplier / current flow                                             | Terms reviewed and mechanism                                                                                                                                                              | Location/retention evidence and remaining action                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase — BusSafe database/Auth and server functions               | [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum), version August 1, 2026, supplements the service agreement and takes effect with it                         | Fresh project observation: ca-central-1, ACTIVE_HEALTHY, platform 17.11.0.011. [Residency FAQ](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq) distinguishes regional core storage from operational/support flows. Retain actual account party/terms and backup/log/support windows; database region is not Canadian-only processing. |
| Netlify — site/CDN/functions and operational logs                   | [Current DPA download from Trust Center](https://www.netlify.com/trust-center/), June 9, 2026, forms part of the enterprise or self-serve agreement as applicable                         | Public DPA download was read; the old static PDF address returned 404 and should not be used as the evidence link. Record actual team contract, function/log countries, retention and downstream services. Do not infer a SafeBus SLA from Netlify terms.                                                                                                            |
| Resend — transactional email and fixed operations alerts            | [DPA](https://resend.com/legal/dpa), public version December 31, 2025 reviewed earlier in this session: incorporated with the applicable service agreement                                | Prior account observation shows North Virginia/us-east-1 sending. A later retrieval timed out, so no newer revision is asserted. Retain applicable account terms, current content/log expiry and tracking settings. Provider acceptance is not inbox receipt.                                                                                                        |
| Zoho Mail — info@safebus.kids business/support/privacy mailbox      | [Privacy policy and DPA request route](https://www.zoho.com/privacy.html#data-processing-addendum): a DPA can be requested for signature                                                  | Fresh public MX observation: mx.zohocloud.ca, mx2.zohocloud.ca, mx3.zohocloud.ca. This establishes Canadian mail-routing hosts, not all account storage/support locations. Confirm the account data centre, retention/trash/backup settings, access and applicable contractual data-protection coverage. No request was submitted and no signature invented.                                   |
| Geoapify — map tiles/API request metadata                           | [Privacy policy](https://www.geoapify.com/privacy-policy/), including API processing, reviewed                                                                                            | Provider describes EU hosting, technical request data and generally no more than 24 hours for successful request data; that is not a universal deletion guarantee. It also names distributed delivery/security services. Record account terms/DPA applicability, actual endpoints/countries, unsuccessful-request handling and key/quota controls.                   |
| Google Firebase Cloud Messaging — recipient-opt-in Android delivery | [Firebase privacy/security and linked processing terms](https://firebase.google.com/support/privacy), reviewed                                                                            | Public documentation describes global processing and installation-ID retention until a deletion API request, then removal from live/backups within 180 days. Do not equate SafeBus token revocation with provider identifier deletion. Confirm actual project terms/entity and device disposal behavior; no Analytics/Crashlytics use is assumed.                    |
| Stripe — own-business subscription/invoice/payment processing       | [DPA](https://stripe.com/legal/dpa), September 28, 2026, incorporated into the agreement; country-specific versions must be checked against the account                                   | Financial processing has controller/processor distinctions. Confirm the account-specific agreement/entity and financial record windows. No transport roster/location belongs in payment payloads; the application stores a limited billing projection.                                                                                                               |
| GitHub Actions/artifacts and owner recovery storage                 | [GitHub privacy policy](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement) and actual account/artifact settings still need account-specific review | CI source/build metadata and encrypted recovery transfers are distinct from durable recovery custody. Record artifact expiry, access/countries and restricted owner-copy/key handling; no all-Canadian guarantee or blanket approval follows from encryption.                                                                                                        |

Public DNS was observed using Google's DNS-over-HTTPS resolver on November 5;
no mailbox content or credentials were read. Zoho use was also owner-confirmed
in the earlier business-email setup. [Zoho data-centre guidance](https://help.zoho.com/portal/en/kb/accounts/manage-your-zoho-account/articles/data-center-for-zoho-account)
explains account-specific region selection. Exact account evidence remains needed.

## Concrete account evidence to collect

For each enabled account, retain a restricted record with: legal account holder,
applicable service agreement/DPA version and incorporation or signature evidence,
actual data/purpose, primary and supporting countries, staff/support access,
content/log/backup expiry, incident and request-assistance obligations, downstream
supplier change process, account owner and review date. Use non-secret evidence
references in Git. Do not copy contracts, personal billing addresses or keys here.

For Zoho, use the DPA request form linked in its privacy policy, with Sachman Gold
Inc. as the intended business party and info@safebus.kids as the contact. Verify
the actual account holder and private signing details before submission/signature.
This review prepares the route; it does not send a vendor message or sign terms.
The existence of a DPA request form does not itself establish a universal legal
requirement to countersign it. Assess the existing account terms and actual
customer/privacy requirements before choosing that route.

## Required disposal distinctions

- Database rows, Auth identities/sessions and device registrations are different
  records/actions; access revocation is not a complete erasure certificate.
- Resend content/history and the delivered Zoho mailbox copy are separate stores.
  A short application outbox period does not delete either mailbox/provider copy.
- Firebase identifiers require their applicable provider/device workflow; removing
  a SafeBus device row is not proof that provider data has been removed.
- Immutable backups, GitHub artifacts, owner exports and legal/financial records
  have separate expiry/hold obligations. The primary database schedule cannot
  guarantee selective deletion from those copies.

The [retention schedule](retention-schedule.md) contains specific proposed periods
and the actual execution blockers. No new supplier, plan purchase, signature,
account deletion or processing expansion is authorized by this review record.

## Follow-up evidence register — 2026-11-06

This November 5 public-terms review is historical and does **not** establish that any provider's actual account agreement or cross-border processing is approved. The [November 6 approval gap review](../privacy-supplier-launch-review-2026-11-06.md) and the [supplier-by-supplier evidence ledger](supplier-approval-ledger-2026-11-06.json) list the current private evidence requests, with all supplier decisions pending. The live Supabase primary region was rechecked as `ca-central-1`; backup, log and support processing remain distinct unanswered questions. The configured website Geoapify key and delivered operations email are technical acceptance evidence, **not** contractual supplier approval.

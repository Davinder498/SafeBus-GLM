# SafeBus Supplier Disclosure — Draft

**Status:** Inventory for review; vendor contracts, countries and notices pending
**Operator:** `[PROVIDER_LEGAL_NAME]`
**Privacy contact:** `[PRIVACY_EMAIL]`

This disclosure covers both transport-service suppliers and suppliers for
SafeBus's own business activities. Not every supplier is a transport subprocessor.
The final DPA appendix must identify the actual legal entities and roles.

| Supplier                                   | Service and information involved                                                                                                    | Location/approval still required                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase                                   | Hosted database/Auth; identity, assignments, trips, location, notifications and audit; service sessions                             | Actual project, processing/backups, logs and support-access country evidence; intended Canadian primary region is not full-service evidence                   |
| Netlify                                    | Website/CDN/function delivery; requests and any necessary function processing, technical/network metadata                           | CDN/function/log/backup countries and retention; do not claim no stored personal data without checking provider logs and settings                             |
| Resend or final approved email vendor      | Invites, enabled recorded transport email and business inquiries; recipient email, necessary content and delivery metadata          | Actual enabled services, delivery/queue/log countries and retention, agreement and customer notice/approval                                                   |
| Stripe                                     | Annual per-bus subscriptions, billing contacts, invoices, payment methods and provider metadata                                     | Financial/business-processing role, actual countries, terms, DPA where applicable and retention; transport roster/location must not be sent                   |
| Geoapify                                   | Map tiles; viewport tile coordinates, device IP, origin/referrer and request metadata                                               | Actual countries, log retention, restricted key and privacy/contract evidence; viewport requests are not information-free                                     |
| GitHub Actions/artifacts                   | Build/release source and metadata; protected recovery export transfer may hold encrypted database/role archives and schema evidence | Artifact processing/storage countries, restricted access and short transfer retention; encryption does not automatically remove privacy/residency obligations |
| Owner-controlled recovery storage          | Restricted off-site encrypted recovery copies                                                                                       | Exact Canadian custody/location, key separation, access and retention evidence; a copy/checksum is not a full restore                                         |
| Google Firebase Cloud Messaging            | Optional device token and limited delivery metadata/payload                                                                         | Outside CR1 activation; separately gated, off until approved; supplier-country/security/notice decisions still needed                                         |
| Monitoring/error service and support tools | Potential event, diagnostic or ticket metadata                                                                                      | Not selected/approved here; minimize/scrub sensitive data, then assess actual country, access and retention                                                   |

For each active supplier, the final disclosure must state the actual country or
countries and purpose, how a person can obtain the relevant policies, and a
working contact able to answer questions. Unknown locations cannot be substituted
with a statement that all processing is Canadian. Canadian-region database
configuration does not settle email, maps, payments, support or artifact storage.
[Alberta supplier-disclosure guidance](https://www.alberta.ca/organization-responsibilities-for-protecting-personal-information).

Final publication requires the owner/vendor decisions and relevant customer
instructions. A listed supplier is not approved merely because its code is in
the repository or a paid plan is available. Customer identity, credentials,
contract copies and confidential reports remain outside this public draft.

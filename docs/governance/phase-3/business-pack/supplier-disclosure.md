# SafeBus Supplier Disclosure — Draft

**Status:** Inventory for review; vendor contracts, countries and notices pending
**Operator:** Sachman Gold Inc.
**Privacy contact:** [info@safebus.kids](mailto:info@safebus.kids)

This disclosure covers both transport-service suppliers and suppliers for
SafeBus's own business activities. Not every supplier is a transport subprocessor.
The final DPA appendix must identify the actual legal entities and roles.

| Supplier                                   | Service and information involved                                                                                                    | Location/approval still required                                                                                                                                                              |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase                                   | Hosted database/Auth; identity, assignments, trips, location, notifications and audit; service sessions                             | Actual project, processing/backups, logs and support-access country evidence; intended Canadian primary region is not full-service evidence                                                   |
| Netlify                                    | Website/CDN; invitations, notification payloads, billing, authorized record exports and technical/network metadata; proposed agreement PDF processing                           | Configured function region verified November 11: **CMH (Ohio, US East), United States**. CDN/log/support/backup countries and retention remain to be verified                                                             |
| Resend | Invites/recovery, business inquiries and opt-in guardian event emails; pickup/drop-off external subject/body uses **generic event text without student names, bus numbers, stops or event times**. Recipient, event category and delivery metadata remain processed; other email types and previously delivered emails can contain additional information | The configured sender region is `us-east-1`; [Resend's public guidance](https://resend.com/security) states **US storage** regardless of sending region, standard 30-day email/log retention, and a DPA pre-signed/executed at signup. Confirm account party, actual plan, downstream processing and school-authority approval of the remaining cross-border email data. Live synthetic delivery unverified. |
| Stripe                                     | Annual per-bus subscriptions, billing contacts, invoices, payment methods and provider metadata                                     | Financial/business-processing role, actual countries, terms, DPA where applicable and retention; transport roster/location must not be sent                                                   |
| Geoapify                                   | Map tiles; viewport tile coordinates, device IP, origin/referrer and request metadata                                               | Actual countries, log retention, restricted key and privacy/contract evidence; viewport requests are not information-free                                                                     |
| GitHub Actions/artifacts                   | Build/release source and metadata; protected recovery export transfer may hold encrypted database/role archives and schema evidence | Artifact processing/storage countries, restricted access and short transfer retention; encryption does not automatically remove privacy/residency obligations                                 |
| Owner-controlled recovery storage          | Restricted off-site encrypted recovery copies                                                                                       | Exact Canadian custody/location, key separation, access and retention evidence; a copy/checksum is not a full restore                                                                         |
| Google Firebase Cloud Messaging | Opt-in device token, opaque notification identifier/event type and generic event-title/body text; limited delivery metadata | Protected dispatcher **v7** was deployed and the exact reviewed production source verified on November 8, 2026. Historical potentially detailed messages, Google processing countries/retention/terms and deferred physical Android acceptance still require review. |
| Monitoring/error service and support tools | Potential event, diagnostic or ticket metadata                                                                                      | Existing Netlify/GitHub health checks, Resend fixed alerts and business inbox; app error telemetry and staffed support coverage remain incomplete                                             |

For each active supplier, the final disclosure must state the actual country or
countries and purpose, how a person can obtain the relevant policies, and a
working contact able to answer questions. Unknown locations cannot be substituted
with a statement that all processing is Canadian. Canadian-region database
configuration does not settle email, maps, payments, support or artifact storage.
[Alberta supplier-disclosure guidance](https://www.alberta.ca/organization-responsibilities-for-protecting-personal-information).

## Public primary-source review, 2026-10-15

Account observation, 2026-10-16: Resend verified the `safebus.kids` sending
domain in `us-east-1` (North Virginia, United States). Sending is enabled at the
provider domain level; receiving is disabled. TLS is **Enforced**: delivery fails
for recipients whose server cannot accept encrypted transport, rather than
falling back to cleartext ([provider TLS documentation](https://resend.com/docs/dashboard/domains/tls)).
No tracking subdomain is configured; the configuration page offers “Enable
tracking metrics”. Confirm tracking remains disabled before a first delivery.
Application credentials and end-to-end acceptance are separate evidence, recorded
in [official-domain setup](../../../operations/official-domain-setup.md).

This establishes a US email-content flow when enabled, not merely a metadata
transfer. Do not claim wholly Canadian processing. The owner approved the standard notification privacy setup on 2026-10-24.
Domain setup alone did not establish this approval. Preserve recipient opt-outs
and device permissions; supplier terms and customer instructions still need evidence.

These are provider statements checked on this date, not an account-specific
approval or proof of every location used by SafeBus. An EU SCC or GDPR statement
does not itself settle Alberta duties. No agreement was signed by this review.

| Supplier                     | Primary-source evidence                                                                                                                                                                                                                                                                                                                                                                                                                      | SafeBus decision still needed                                                                                                                                                                                                                                     |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase                     | [Residency FAQ](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq) says database/Auth/storage and backups use the chosen region, while some processing leaves that region. It identifies a Singapore primary processor and US operational/support affiliate. [DPA](https://supabase.com/legal/customer-resources/data-processing-addendum) describes instructions, regional processing and downstream providers. | Retain actual applicable agreement/account entity, Canadian project evidence and precise support/log/subprocessor flows. The FAQ does not establish that all processing is Canadian.                                                                              |
| Netlify                      | [Privacy statement](https://www.netlify.com/privacy/) distinguishes its own-controller processing from customer processing governed by a DPA. The [Trust Center](https://www.netlify.com/trust-center/) publishes a DPA download and subprocessor purposes/locations, including US infrastructure and logging providers.                                                                                                                     | Capture the applicable account DPA, CDN/request logs, retention and support access. Configured function region was verified November 11 as CMH (Ohio, US East). A provider-wide list does not prove that every listed AI/analytics provider receives this app's transport records.                                  |
| Resend (if selected/enabled) | [DPA](https://resend.com/legal/dpa), last updated 2025-12-31, identifies Plus Five Five, Inc., instruction/confidentiality/return-deletion provisions, subprocessors and primarily US processing.                                                                                                                                                                                                                                            | Confirm actual email service/account and applicable terms, Auth/invitation versus event/inquiry paths, downstream countries, content/log retention and tracking configuration. Reading the public DPA is not acceptance on the owner's behalf.                    |
| Geoapify                     | [API privacy policy](https://www.geoapify.com/privacy-policy/) says API request bodies/headers/IP/timestamps may be retained, generally no more than 24 hours for successful requests, with EU hosting and global delivery/security services. [Imprint](https://www.geoapify.com/imprint/) identifies the business.                                                                                                                          | Identify actual hosting/CDN countries and error/log limits for the chosen endpoint/account, necessary map payload and applicable contractual terms. “EU” is not an exact country list and the successful-request limit is not a universal log-deletion guarantee. |
| Stripe                       | [Canadian privacy policy](https://stripe.com/en-ca/privacy) covers payment/business relationships, service-provider and independent purposes and international processing.                                                                                                                                                                                                                                                                   | Record actual contracting entity/account terms, relevant processing countries, invoice/payment retention and minimal SafeBus billing fields. No roster/location data is authorized for payment processing by listing Stripe here.                                 |

Supplement this with actual GitHub, storage, recipient-opt-in FCM and
monitoring/support arrangements. Disabled or out-of-scope services need evidence of that boundary.
The final public country/purpose disclosure must match actual enabled flows and
provide info@safebus.kids as the direct privacy route. Country, supplier-window
and staffed-response evidence remains incomplete.

Final publication requires the owner/vendor decisions and relevant customer
instructions. A listed supplier is not approved merely because its code is in
the repository or a paid plan is available. Customer identity, credentials,
contract copies and confidential reports remain outside this public draft.

## Current account and source reconciliation — 2026-11-05

See the [dated reconciliation](../../../operations/privacy-commercial-operations-2026-11-05.md).
BusSafe primary database region is ca-central-1. This supports a Canadian primary
database statement, not Canadian-only processing or a verified backup window.
Resend also sends fixed operational alerts to info@safebus.kids. These contain
check identifiers and log links, without customer rows or bus locations.
GitHub/Netlify scheduling and Resend delivery remain supplier dependencies.
Public vendor documents reviewed today: [Supabase residency](https://supabase.com/legal/privacy-resources/data-residency-and-transfers-faq),
[Netlify Trust Center](https://www.netlify.com/trust-center/),
[Firebase privacy/security](https://firebase.google.com/support/privacy), and
[Resend DPA](https://resend.com/legal/dpa). Public terms are review inputs; they
do not establish acceptance by the actual SafeBus account or resolve every country.

## Verified release and customer-processing reconciliation — November 8, 2026

The [school-authority supplier-processing review](district-supplier-processing-appendix-review-2026-11-08.md) inventories currently known transport-data services separately from SafeBus business correspondence. The Firebase outbound **notification text** is generic following the protected [push-dispatcher v7 release](https://github.com/Davinder498/SafeBus-GLM/actions/runs/42533721182). The deployed shared module matches merged source; no post-release physical delivery has been verified. Resend's standard agreement is already pre-signed/executed at signup according to [its security FAQ](https://resend.com/security), but SafeBus still needs to record the real business account, vendor terms, downstream processing and the authority's instructions. After PR #414, a [protected Netlify verification run](https://github.com/Davinder498/SafeBus-GLM/actions/runs/42543503884) confirmed the published source includes the generic pickup/drop-off email rendering fix (Nov. 8, 2026, Alberta time). Actual outbound Resend JSON was verified with mocked tests, **not** a live provider delivery. Earlier emails and other email categories remain outside that redaction. These records are not a customer-approved DPA or an authorization to publish agreements.

## Mailbox and agreement completion

Zoho Mail handles info@safebus.kids business, support and privacy correspondence.
Its public MX records route to Canadian Zoho mail hosts; that is not proof of
all account storage/support locations or deletion windows. See the
[2026-11-05 terms/data-flow review](../supplier-review-2026-11-05.md) for active
provider mechanisms and specific account evidence still needed. Keep received
mailbox copies separate from Resend sending/delivery records in disposal plans.


## Approved supplier authorization policy — November 11, 2026

Initial agreement acceptance must identify and affirmatively authorize the exact
transport-data supplier appendix. Planned material supplier additions or country
changes receive at least 30 calendar days' notice and require the affected
Customer's recorded affirmative approval before its information uses the change.
Silence and continued use do not authorize it. Urgent containment may isolate or
stop processing but does not create a supplier-consent exception. SafeBus must
verify corresponding downstream privacy terms and remains responsible for its
supplier obligations. The owner approved this process, not the unresolved
vendor facts above or acceptance on a Customer's behalf.


## Verified Netlify project setting — November 11, 2026

Read-only inspection of the signed-in `bussafe` project, Functions → Region:
**CMH (Ohio, US East), United States**. The page reports 25 functions actively
running in production. This is evidence of the project deployment-region setting,
not per-invocation tracing or proof of every CDN, log, support or backup location.
The supplier appendix must disclose the configured US processing; Canada Central
database hosting does not establish Canadian-only processing for SafeBus.

The account overview shows builds stopped and a Free-plan build-minute limit
notice, while the site remains online. No build was activated, region changed,
plan upgraded, secret viewed or contract accepted during this inspection.
Account-specific DPA applicability, secondary locations and retention remain open.
Source: authenticated Netlify project `bussafe`, Functions → Region, inspected
November 11, 2026 (America/Edmonton). Earlier “function region unverified” notes
are superseded only for this configured region; other supplier evidence is not
implicitly approved.

## Standard supplier terms clarified — November 12, 2026 UTC

A separately countersigned document is not automatically required for every
supplier. Netlify's [June 9, 2026 DPA](https://www.netlify.com/pdf/netlify-dpa.pdf)
forms part of its self-serve or enterprise agreement. The [November 4 self-serve
terms](https://www.netlify.com/pdf/self-serve-subscription-agreement.pdf) identify
Netlify, Inc. and acceptance through signup/use, including authorized company use.
The account's contracting party and any superseding agreement still need recording;
do not mislabel missing retained evidence as proof that no DPA exists. Netlify's
retention/deletion summary is access-on-request in its Trust Center.

[Resend's GDPR guidance](https://resend.com/security/gdpr/) confirms a DPA for every
account without a second countersignature, with its executed copy under Documents.
Standard Free/Pro/Scale email and log retention is 30 days, backups seven days, and
remaining data after service termination is deleted within 90 days. These are
distinct triggers, not a promise that every customer copy disappears in seven days.
Individual sent-email deletion is not available by API; early removal requires an
authorized account request. Its [security page](https://resend.com/security) gives
at least 14 days' subprocessor-change notice. This cannot substantiate 30 days'
advance notice for every downstream vendor change; SafeBus must evaluate notice
and approval before affected processing, rather than silently assume approval.

[Geoapify's DPA](https://www.geoapify.com/data-processing-agreement/) identifies
KEPTAGO LTD in Cyprus and API servers in Germany/Finland. Its standard map host
uses Cloudflare; the expressly EU-bound guarantee applies to api-eu.geoapify.com.
Normal identifiable request details are kept no longer than 24 hours, with
exceptional suspicious/fraud cases up to two months. Do not describe the current
maps.geoapify.com flow as EU-only or every log as deleted within 24 hours.
These provider terms narrow the evidence gaps; they do not establish every
SafeBus account fact, customer approval or completed assisted return.

## Netlify scope and supplied evidence — November 12, 2026

The [processing and retention review](netlify-processing-retention-review-2026-11-12.md)
records the actual function data paths, supplied June 2026 DPA and ISO certificate,
and the limits of those documents. Supabase database residency does not eliminate
US processing by Netlify functions. The DPA provides return/deletion obligations,
but not a complete plan-specific expiry timetable. The Enterprise-headed log
periods are not assumed to apply to this account. The missing retention summary
is a targeted follow-up, not a blanket prerequisite to all agreement work.

Current observed plan: Free legacy. Owner-planned upgrade: Personal, not yet
completed or verified. No Enterprise coverage or retention terms are inferred
from that intention. Account-party and country reconciliation remains separate
from possession of the standard DPA; no supplier approval is fabricated.

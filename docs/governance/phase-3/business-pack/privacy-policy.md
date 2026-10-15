# SafeBus Business Privacy Policy — Draft

**Review status:** Business draft; not effective or approved for publication
**Operator:** `[PROVIDER_LEGAL_NAME]`, operating as SafeBus Alberta / BusSafe
**Proposed effective date:** `[EFFECTIVE_DATE]`
**Privacy contact:** `[PRIVACY_EMAIL]`; business address `[PROVIDER_BUSINESS_ADDRESS]`

Before publication, fill the contacts, approve the supplier-country disclosures,
confirm enabled features and retention, and reconcile this notice with the app,
account-deletion page and Android store forms. The policy text below describes
the proposed operating practice, not a certification of the prelaunch system.

## Who we are

SafeBus supports school transportation operations and authorized visibility of
an active bus trip. We track the bus, not the child. We do not track a child's
phone, wearable or personal GPS device. SafeBus is a business-owned service;
participating school authorities direct the use of their transportation records.

For customer-directed records, the authority determines authorized purposes,
participants and requests concerning its records, and SafeBus assists it. SafeBus
also handles information for its own necessary business activities, such as
responding to inquiries, administering contracts, billing, security and support.

## Information involved and why

| Information                                                                    | Purpose and source                                                                                                                          |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Name, email, role, school/tenant association and optional contact details      | Invitations, sign-in, authorized access and operational contact; supplied by the user or school authority                                   |
| Minimum student roster and guardian link                                       | Name, grade, school, bus/route/stop assignment and authorized relationship; supplied or verified by the authority for transportation        |
| Bus, driver assignment, route, stop and trip records                           | Operate the assigned service, maintain the driver's minimum manifest and display the authorized bus                                         |
| Active-trip location and timestamps, accuracy and operational movement details | Collected from the assigned driver's authorized phone for bus visibility and transport operations; may identify the driver or linked people |
| Recorded pickup/drop-off events                                                | Operational records and enabled guardian email; an event is a recorded action, not proof of a child's current location                      |
| Device/session information, permission state and protected offline queue       | Authenticate the device, limit active-trip collection, secure the account and recover previously collected events                           |
| Notification choices and delivery records                                      | Apply authorized recipient scope, optional email preferences and delivery troubleshooting                                                   |
| Business inquiry, support and contract information                             | Respond to requests and administer the business relationship; do not include unnecessary student or sensitive information in messages       |
| Subscription, invoice/payment status and purchase-order reference              | Annual per-bus contract administration; Stripe handles payment methods, while SafeBus retains a limited billing summary                     |
| Security/audit events and supplier request metadata                            | Abuse prevention, investigation and accountability; may include IP addresses and technical identifiers                                      |

A role's access depends on its current authority. Guardians receive information
for their active linked students and assigned bus; drivers receive assigned
operational information; administrators receive their authorized tenant/school
scope. Platform administration is restricted to the business control plane and
aggregate health, rather than browsing customer transportation records.

We exclude student home addresses, health information, custody narratives and
prohibited government student identifiers. We do not use transport records for
advertising, resale, unrelated profiling or AI-model training.

## Android permissions and location

Driver location is collected only through an authorized active-trip workflow.
Collection may continue while the app is backgrounded or the screen is locked,
with the Android service notification. Pausing or ending collection stops new
fixes; securely queued earlier records may still be transmitted during permitted
recovery. Revocation, lost connectivity and permission changes can interrupt the
service; offline revocation and device behavior require tested limits.

Guardians do not need to share their own GPS for bus visibility. The camera
permission supports the authorized bus QR start workflow; it does not authorize
child tracking. Before publication, verify camera-image handling and the exact
supported Android permissions against the released binary.

Optional Android FCM push and student QR are outside the locked CR1 activation
scope. They are not made available by this policy. If separately authorized,
provide revised disclosure and any required consent before processing.

## Choices and legal grounds

The authority supplies the applicable authority and collection notice for its
transportation activities. App permission and acceptance of terms do not, by
themselves, establish that legal authority. For SafeBus's own activities, we
identify the purpose, provide applicable notice and obtain consent where required
or use a documented applicable exception. Mandatory and optional purposes must
be distinguished before collection.

You can manage optional notification settings and device permissions. Withdrawal
may prevent the related optional service or driver tracking, but does not erase
records that must be retained for a lawful reason. Contact us for an alternative
request route if you cannot sign in.

## Suppliers and countries

Hosting/authentication uses Supabase; web/function delivery uses Netlify; maps
use Geoapify; transactional email uses Resend or the selected provider; subscription
billing uses Stripe. Maps disclose tile coordinates describing the viewport,
IP address and ordinary request metadata. Email may include recipient email,
the student's first name for an enabled recorded pickup/drop-off notice, event
type and time. Payment methods are provided to Stripe rather than stored in
SafeBus application records.

Before this policy takes effect, publish the final
[supplier disclosure](supplier-disclosure.md) with actual countries, purposes,
backup/log handling and relevant support access. Canadian database storage alone
does not mean all service processing is Canadian. Suppliers may be subject to
laws in the countries where they operate. We review lawful disclosure demands,
minimize disclosures, and notify the affected customer when legally permitted.
Optional monitoring, support tooling or push providers require their own review.

## Retention and deletion

We limit retention to the approved purposes and legal requirements. The proposed
schedule includes 30 days for raw bus location, 90 days for terminal notification
records and 13 months after inactivity or trip end for specified operational
records; these are draft periods, not statutory periods or promises of an enabled
deletion job. Before publication, replace this paragraph with the approved,
tested periods, including business records and supplier backup/log windows.

Deleting an account does not necessarily erase all authority-controlled transport
records, invoices, security evidence or records under a valid hold. Explain any
remaining categories, reasons and retention to the requester. Backups age out
under the separately approved window; authorized restores must reapply verified
deletions before normal processing resumes.

## Access, correction, deletion and complaints

For school transportation records, contact the issuing authority's privacy
office. SafeBus can route your request and assist the authority. For information
held for SafeBus's own business purposes, contact `[PRIVACY_EMAIL]` directly.
You do not need an active app account or school response to ask us about our own
business records or report a privacy concern.

We verify identity proportionately, protect other people's information, record
the request and apply the relevant statutory response rules. Account-deletion
instructions will be at `[DELETION_URL]`. Permission to view a linked bus is not
automatic authority to receive every student record through an access request.
If your concern is unresolved, you may contact the
[Office of the Information and Privacy Commissioner of Alberta](https://oipc.ab.ca/)
or the applicable regulator.

## Safeguards, incidents and changes

Our approved operating standard will use proportionate access controls,
encryption, restricted administrative access, logging and reviewed releases.
The Security Schedule identifies controls and prelaunch evidence. No system is
guaranteed risk-free. We assess suspected incidents, contain them, coordinate with
customers and make notifications required by the applicable law and agreement.

Material changes require review of purpose, supplier, retention, data flow and
notice. We inform affected users or customers through appropriate channels before
new processing where required. This notice does not authorize broader features
or unrelated collection merely because it is updated.

## Contact and accountability

Address privacy questions to the business owner, the appointed Privacy Lead,
at `[PRIVACY_EMAIL]` or `[PROVIDER_BUSINESS_ADDRESS]`. The owner selected this
role on 2026-10-15; the contact details remain unresolved. It is not necessary
for that business role to be a lawyer. Legal-review
and customer-specific approval obligations are handled separately.

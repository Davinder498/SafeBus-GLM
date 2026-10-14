# SafeBus Data Inventory and Information Flows — Draft

**Status:** Source-based working inventory; installed-schema, field-authority and elimination review pending
**Owner:** Business Privacy Lead / Engineering with the relevant customer
**Last updated:** 2026-10-13

## Scope and use

This inventory supports the [PIA](privacy-impact-assessment.md) and
[business privacy/contract pack](business-pack/README.md). It covers the CR1
transport purpose and SafeBus's own inquiry, billing, support and security flows.
It is not an exhaustive audited live-schema catalog or approval of every field.
Validate the released schema/RPC responses, device storage and enabled providers
before final authority or publication decisions. Data listed as future/gated
is not approved for activation by this inventory.

Each field/class needs an identified source, necessary purpose, actual legal
provision or applicable consent/exception, authorized recipient, retention
trigger and disposal mechanism. The older draft's "contract performance" and
"legitimate interest" shorthand did not establish POPA authority. No field's
legal ground is approved here. Customer-directed activities require customer
POPA/education assessment; own-business activities require separate PIPA/PIPEDA
assessment, including any applicable business-contact exclusions.

## Working field/class inventory

| Fields / source objects                                                                                                            | Necessary proposed purpose                                  | Source and recipients                                                                | Retention / unresolved review                                                                                                    |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Account `email`, `role`, `tenant_id`, school association and minimum name/contact                                                  | Invite/authenticate users and scope permissions             | User/customer; Supabase Auth, account user and authorized operators                  | Account lifecycle; verify installed field/RPC exposure and Auth deletion                                                         |
| Student `first_name`, `last_name`, preferred/structured name, `grade`, `school_id`                                                 | Minimum roster/manifest and route context                   | Customer; scoped administrators/assigned driver and appropriately narrow linked view | Proposed active + 13 months inactive; determine lawful purpose per field                                                         |
| Guardian/driver name, email and optional phone                                                                                     | User identity and necessary contact                         | Customer/user; permitted administrators; supplier delivery only when needed          | Proposed lifecycle schedule; eliminate unnecessary phone/identity exposure                                                       |
| `student_guardians` student/guardian keys, relationship, active/expiry/verification/audit data                                     | Link authorized guardian to bus visibility                  | Customer decision; scoped admins and authorized linked RPCs                          | Authority loss is not the same as physical link deletion; S2 notes/privacy acceptance open                                       |
| Student route/bus-service, driver route and bus route assignment data                                                              | Authorize transport work and determine assigned bus/stop    | Customer operations; scoped operators and minimum role views                         | Effective assignment and lifecycle; validate dependencies/NULL-school cases                                                      |
| Bus identifier/capacity/fleet metadata; route/stops/shapes/patterns                                                                | Fleet and route operation                                   | Customer operators; scoped driver/admin/guardian outputs                             | Operational purpose; avoid exposing internal fleet/private fields to unintended roles                                            |
| `driver_trips` state/times and authorized exception actions                                                                        | Trip lifecycle and operation                                | Assigned driver/admin; limited linked status                                         | Proposed 13 months after end; exclude guardian replay                                                                            |
| `driver_trip_location_updates`, `driver_trip_current_locations`: coordinates, timestamps, accuracy/movement fields                 | Active bus location and freshness/history                   | Assigned authorized phone; scoped admins/guardians via reviewed interfaces           | Proposed raw 30 days; exact columns/recipients and current/history authorization pending                                         |
| Bus/session credential hashes and short-lived tracking bindings                                                                    | Bind device/driver/bus/trip                                 | Approved server/driver workflow; secrets restricted                                  | Proposed 30 days for ended credentials; real-session expiry/revocation separately verified                                       |
| `student_trip_events` pickup/drop-off type/time and permitted source keys                                                          | Manual operational event and enabled guardian email         | Assigned operator; authorized linked recipient/admin                                 | Accepted trip/event retention; no claim of a child's current location                                                            |
| Email outbox/recipient resolution and notification choices                                                                         | Scoped email dispatch and user choices                      | Server resolves recipient; Resend/approved email provider                            | Proposed 90 days terminal rows; provider queue/log/inbox retention separately assessed                                           |
| In-app notification codes/source/read/archive state                                                                                | Role-scoped operational inbox                               | Authorized current recipient                                                         | Proposed 90-day inventory period; CR1 permitted categories and migration coverage need review                                    |
| Audit action/actor/target/network/outcome and bounded details                                                                      | Security accountability and scoped investigation            | Authorized writer/reviewer only                                                      | Proposed 24 months identifying data; test sanitization and residual linkability                                                  |
| Invitation, session mirror, fixed-window limiter and security config                                                               | Onboarding/authentication/abuse prevention                  | User/server with role restrictions                                                   | Proposed invitation/session/counter schedule; S3/S5 hosted acceptance open                                                       |
| Tenant name/status/timezone and narrow service/subscription attributes                                                             | Customer and control-plane administration                   | Platform and scoped tenant administrators                                            | Contract/account lifecycle; no platform operational-data browsing                                                                |
| Inquiry `requestId`, `name`, `workEmail`, `organization`, `role`, optional `phone`, topic and `message`; honeypot/network controls | Respond to a prospective-customer inquiry and prevent abuse | Public form → Netlify function → business email via provider                         | Not stored as an application database inquiry row in current code; provider/mailbox/network copies still require disposal review |
| Billing contact, PO, licensed bus count, price/term/renewal and invoice status; provider identifiers                               | Annual per-bus CAD contract and invoice administration      | Platform billing actions, Stripe and restricted projection; tenant billing view      | Finance/legal periods pending; no transport roster/location or stored card/bank details                                          |
| Support correspondence, diagnostics and staff/training/appointment records                                                         | Necessary business support/personnel/privacy accountability | User/business and approved systems                                                   | Tooling/purpose periods pending; no unnecessary student/secret copies                                                            |
| Android installation/config/session state; event ID/sequence and encrypted local payload                                           | Secure local operation and permitted recovery               | Driver phone; authorized ingestion                                                   | Payload encryption in native source; local purge/expiry/remote limits require physical tests                                     |
| Supabase/Netlify/CDN/API/network metadata and logs                                                                                 | Delivery/authentication/security                            | Provider systems and approved operators                                              | Actual countries/log settings and minimized window unverified                                                                    |
| Geoapify tile coordinates, IP, origin/referrer and normal request metadata                                                         | Render permitted map view                                   | User device → map vendor                                                             | Viewport reveals context; country/retention/contract decision pending                                                            |
| Encrypted database/role backup archives and schema/checksum evidence                                                               | Approved recovery export/transfer                           | Protected exporter → GitHub artifact → controlled recovery storage                   | Restricted access, countries and all copy/key retention require review; encryption is not exemption                              |

## Future or separately gated information

Student QR development credentials are not an approved CR1 boarding feature.
Android FCM device token/installation/permission and push delivery records are
subject to separate opt-in, tenant and supplier/privacy/security activation.
Monitoring/error tools and ticket systems not yet selected must be inventoried
before use. None is enabled or approved by adding it to a draft table.

## Flow, purpose and minimization review

Use the information-flow diagram in [PIA section 5](privacy-impact-assessment.md#5-information-flow-map).
Trace actual data across database/Auth, personal driver phone, browser, CDN/
functions, provider queues/logs, recipient/owner inboxes, Stripe and recovery
artifacts/storage. Do not treat an ephemeral function request as proof that no
provider stores metadata, nor a Canadian database as proof of Canadian-only flows.

Exclude prohibited student identifiers, home addresses, health data, custody
narratives, unrelated SIS data and child-carried GPS. Review stop context and
linkability as well as direct identifiers. Driver licence verification must not
import raw licence images by default. Free text can receive unwanted sensitive
information: review validation, instructions, access and disposal, rather than
claiming controlled formats automatically eliminate that risk.

Before final approval, verify exact schema/RPC/columns and local fields, identify
optional/required collection, eliminate unnecessary data, assess direct/indirect
notice and authority per activity, confirm providers/countries, and reconcile
accepted periods with implemented disposal/holds. Record actual results outside
Git with non-secret references. This inventory makes no legal, provider or hosted
security acceptance decision.

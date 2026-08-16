# SafeBus Alberta — Driver Privacy Notice (Draft)

**Status:** Draft for Alberta privacy counsel and customer approval — not legal advice
**Owner:** Privacy Lead
**Last updated:** 2026-08-15

## What SafeBus is

SafeBus supports school-transportation operations and live bus visibility.
It tracks an authorized bus trip, not a child or a driver's personal activity.

## Information used

SafeBus may use a driver's name and work contact details, employment or
contract identifier, licence/compliance fields required by the customer,
assigned bus and route, trip actions, device/session metadata, and bus
location reported during an authorized active trip. It does not require an
Alberta Student Number, student home address, health data, or location outside
an authorized trip.

When a driver uses a personal Android phone, SafeBus also uses an app-generated
installation identifier, device model, app version, permission state, encrypted
device credential, connectivity category, and battery percentage needed to
operate and support active-trip tracking. SafeBus does not read personal
contacts, messages, photos, microphone content, browser history, or information
from other applications. SafeBus does not provide the employer with remote-wipe
or general device-management access.

## Why it is used

The information supports account security, driver eligibility, assignments,
trip dispatch and completion, operational bus visibility, incident review,
and legal/security audit obligations. SafeBus does not use driver or student
information for advertising or cross-customer profiling.

## Who can see it

Authorized transportation and tenant administrators can access the minimum
information required for their own organization. A driver sees only their own
or assigned operational data. Guardians receive scoped bus visibility for a
linked student's active trip; they do not receive driver licensing details,
personal contact details, or the full manifest. SafeBus platform staff do not
receive direct access to tenant operational records through the platform-admin
role.

## Location and retention

Location collection is bound to an authorized bus-tracking session and active
trip. It may continue when SafeBus is closed or the screen is locked so the
active bus remains visible. A persistent Android notification indicates when
collection or required offline recovery is active. Collection ends when the
trip ends or is cancelled, the server rejects the session, or the 18-hour
offline authorization expires. Raw history is subject to the draft 30-day ceiling in
[`../retention-schedule.md`](../retention-schedule.md). Inactive driver
operational identity fields are anonymized under the approved schedule;
deleting the associated Auth account is a separate authorized workflow.
Retention periods remain subject to counsel and customer approval.

## Access, correction, and concerns

Drivers submit access or correction requests to their employer/customer's
designated privacy contact. SafeBus assists the customer under the procedure in
[`../access-and-correction.md`](../access-and-correction.md). Suspected privacy
incidents should be reported immediately through the customer's incident
channel; the breach procedure is in
[`../breach-response.md`](../breach-response.md).

## Approval checklist

- [ ] Counsel confirms the applicable statute and SafeBus/customer roles.
- [ ] Customer supplies its legal name, privacy contact, and request channel.
- [ ] Retention periods and subprocessors are approved.
- [ ] Notice is made available to drivers before production collection.
- [ ] Customer approves its personal-device policy, support, data-plan, and reimbursement terms.
- [ ] Android in-app notice and public privacy-policy wording are confirmed as consistent.

# SafeBus Service-Level Agreement — Draft

**Status:** Contract framework; numerical commitments and remedies unapproved

This SLA applies only to the accepted service-start date, supported devices,
approved geography and capacity envelope in the Order Form. A Free prelaunch
deployment, localhost test or supplier SLA is not a commercial SafeBus SLA.

## Service measures

| Measure               | Definition                                                                                                                  | Target to approve                                       |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Availability          | Percentage of included service minutes in a calendar month in which an authorized user can perform the agreed core workflow | `[MONTHLY_AVAILABILITY_PERCENT]`                        |
| Core response latency | p95 of the agreed authenticated workflow/request set, under the supported workload                                          | `[P95_RESPONSE_TARGET]`                                 |
| Fresh-position lag    | Collection timestamp to authorized visible fresh position; report stale/unknown honestly                                    | `[GPS_FRESHNESS_TARGET]` and network/device boundary    |
| Notifications         | Source event to approved email-provider acceptance/delivery as separately defined; failures/retries measured                | `[NOTIFICATION_TARGET]` and receipt definition          |
| Recovery point/time   | Optional separately negotiated service; excluded from the commercial launch assessment                                      | No commitment selected; any later promise needs supporting evidence |

Monthly availability is 100 × (included minutes − unavailable included minutes)
/ included minutes. The parties agree how monitoring measures multi-tenant
impact, partial outages, supplier failures, maintenance and dispute resolution.
No target takes effect while its placeholder or evidence remains open.

Approved maintenance windows, advance notice, maximum exclusions and customer
actions affecting measurement belong in the Order Form. Supplier outages count
according to the accepted definition; they are not silently excluded merely
because the supplier is external. Network/device limitations must be bounded
and disclosed rather than excluding every tracking failure.

## Support and incident response

Support operates during `[SUPPORT_HOURS]` in `[SUPPORT_TIMEZONE]`, with holidays
and emergency escalation defined in the Order Form. Channels are `[SUPPORT_EMAIL]`
and the accepted emergency contact. Define staffed primary and backup coverage
before promising around-the-clock support.

| Priority | Example                                                               | Acknowledgement/update targets                                     |
| -------- | --------------------------------------------------------------------- | ------------------------------------------------------------------ |
| P1       | Suspected privacy/tenant boundary failure or core service unavailable | `[P1_ACK]`; `[P1_UPDATE]`; immediate safety/containment escalation |
| P2       | Material maps, live visibility or email degradation                   | `[P2_ACK]`; `[P2_UPDATE]`                                          |
| P3       | Non-critical issue or individual support request                      | `[P3_ACK]`; `[P3_UPDATE]`                                          |

Acknowledgement is a substantive response by the responsible team, not merely
an automated receipt. Restoration targets are not unconditional guaranteed fix
times. Provide operational fallback and clear status while investigating.
Privacy notifications follow the DPA/law even outside support hours.

## Credits and repeated failure

If agreed availability falls below the accepted threshold, credits are calculated
using the affected recurring service fee, the approved tier/rate table and cap:
`[CREDIT_TIERS]`, `[MONTHLY_CREDIT_CAP]`, `[CLAIM_WINDOW]`. The Customer supplies
reasonable supporting dates; SafeBus's monitoring supports verification. The
parties must decide whether credits are automatic or claimed and how they apply
to annual invoices. No rate or exclusive-remedy limitation is selected here.

Define a repeated/material failure exit right and its prepaid-fee treatment in
the Order Form. Credits do not excuse legal privacy duties or the agreed DPA.
Customer withdrawal and immediate pilot suspension authority remain available
under the applicable agreement and launch policy.

## Evidence required before signature

Retain approved service targets, supplier plans/quotas, alert routing, supported
Android results and evidence for each selected service promise. Backup/full-restore
and disaster-recovery exercises are excluded from launch requirements. Actual
capacity commitments require measurements; this review does not provide them.
The business target of 10,000 buses/100,000 concurrent users is planning,
not a service entitlement. The current controlled-pilot ceiling is 100 buses;
expansion needs separately reviewed evidence and authorization.

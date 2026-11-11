# SafeBus support and incident runbook

**Prepared:** 2026-11-05, America/Regina (UTC−06:00)
**Status:** Procedure prepared for review; coverage and exercises not accepted
**Business:** Sachman Gold Inc., operator of SafeBus
**Intake:** info@safebus.kids
**Privacy accountability:** Business owner, previously selected as Privacy Lead

## Coverage boundary

Owner-approved November 11, 2026: urgent privacy/security incident coverage is
**24/7**, including weekends and holidays, with immediate Customer notice upon
awareness. Ordinary support remains Monday–Friday, 8:00 a.m.–5:00 p.m.
America/Edmonton, excluding Alberta's nine general holidays. Ordinary records
requests receive acknowledgment within two business days and an action plan
within five business days under DPA section 5, not a guaranteed completion date.

The owner confirmed this business commitment. No independent responder, telephone
number or tested absence handoff is inferred. Verify who receives urgent reports,
how alerts reach the available human, and who covers unavailability; record those
details privately. A received email or automatic acknowledgment is not proof of
continuous coverage. Do not advertise general 24/7 technical support.

SafeBus is not emergency dispatch. Urgent transport concerns go to the school
authority's transportation office; emergencies go to 911. For an app outage,
coordinate the authority's existing dispatch procedure rather than treating a
missing location or notification as proof of a student's whereabouts.

## Intake and triage

1. Accept email without an app account. Privacy/account requests must not require
   the sales inquiry form's work email, organization or job-title fields.
2. Open a restricted request/incident record. Record ID, received/awareness time
   in UTC, contact route, authority if known, brief symptom, severity, assigned
   responder, next action/update time and linked evidence. Use `America/Edmonton`
   when communicating Alberta local time (MST in winter, MDT in summer); retain UTC
   in the incident record. Do not use Saskatchewan/Regina time for Alberta deadlines. Actual cases stay outside Git and public issues.
3. Ask only for what is necessary: app version, approximate failure time,
   affected role and a redacted symptom. Never ask for a password, session token,
   recovery/invitation link, MFA code, payment credential, student roster, precise
   bus location or identity document in ordinary email. Arrange a restricted
   verification route when necessary. Do not forward a sensitive attachment.
4. Verify identity and authority before disclosing data or changing access. A
   recognizable address or guardian link is not authorization for every record.
   Route authority records to its authorized privacy/transport contact; handle
   SafeBus's own billing, support and correspondence records directly.
5. Assign the responder and a real next-update time; acknowledge with a concise
   human response. Until coverage is approved, no numerical response promise is
   established. Record statutory/contract deadlines separately and act promptly.
6. If the assigned responder is unavailable, escalate through the agreed backup
   route. A missing backup is a coverage gap to resolve, not successful escalation.

| Priority | Trigger                                                                                                                   | First action                                                                                                                                           |
| -------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| P1       | Suspected cross-authority disclosure, exposed privileged secret, unauthorized live visibility or core service unavailable | Notify the responsible incident/privacy lead and affected authority using verified contacts; begin proportionate containment and fallback coordination |
| P2       | Material maps/location/notification degradation or recurring workflow failure                                             | Establish affected scope and last good operation; investigate provider/quota/queue evidence and advise the authority about degraded operation          |
| P3       | Isolated support issue, commercial question, access/correction/deletion request without an incident indication            | Route to the responsible owner, track verification and legal deadline, and agree next action                                                           |

A privacy request is not low priority if its legal deadline is near. A P3 report
can become P1 when investigation shows exposure. Operational severity does not
decide whether a breach meets the legal reporting threshold.

## Responding to an automated monitor alert

The current monitor checks public landing/security headers, login shell and map
configuration. It does not prove authenticated trips, email/push delivery,
billing, GPS freshness or every role boundary. The links below contain technical
evidence; do not share account details or raw logs with customers.

- Netlify: https://app.netlify.com/projects/bussafe/functions/production-health-scheduled
- GitHub: https://github.com/Davinder498/SafeBus-GLM/actions/workflows/production-health.yml
- Implementation and limitations: [monitoring reliability](monitoring-reliability-2026-11-05.md)

1. Check the subject and current per-check result. A GitHub cadence alert means
   its scheduled main-branch run is missing, stale, incomplete, unsuccessful,
   unverifiable, or that recent successful runs contain a gap greater than
   45 minutes. A later successful run does not erase missed intervals.
   It does not alone establish an application outage. Public-health
   alerts and cadence alerts have separate deduplication keys.
2. Inspect the latest **automatic production** Netlify invocation and latest
   **scheduled** GitHub main run. A successful manual run does not resolve a
   scheduler gap. Record run IDs, UTC timestamps, sanitized result codes and
   deployment commit; do not copy secret-bearing responses.
3. Use the fixed public health checker for bounded diagnosis. If it fails,
   inspect deployment/provider status and affected scope. Do not test by sending
   customer messages, starting real trips, charging cards or writing fixtures.
4. The engineering cadence threshold is 45 minutes; it is not a customer SLA.
   Netlify is scheduled at minutes 11/26/41/56; GitHub at 7/22/37/52. Actual
   scheduled evidence is required to establish cadence.
5. One email per check per six-hour UTC window is expected. Repeated failure
   may be silent within that window, including a second incident after recovery.
   There is no automatic recovery email. Verify recovery in current checks/logs;
   absence of another email does not establish recovery.
6. Provider acceptance does not establish inbox receipt. If alerts stop, inspect
   invocation and sanitized delivery outcomes as well as the inbox. Resend or
   Netlify failure can prevent email. Both monitors rely on their host services;
   no independent dead-man guarantee is represented.
7. Keep the incident open until recovery evidence and an assigned response are
   recorded. The known GitHub cadence gap remains unresolved unless fresh
   scheduled evidence demonstrates otherwise. Do not mute failure by raising
   the threshold or treating manual runs as scheduled evidence.

### Additional application monitoring (staged)

The production-monitor extension remains inactive unless the approved
`SAFEBUS_APPLICATION_MONITOR_ENABLED=true` flag is configured. Once
activated, each check produces a fixed diagnostic code for database
availability, eligible active-trip GPS freshness, queued email/push age,
recent failed deliveries, and a fixed public Geoapify tile probe. An
`app_gps_freshness` check with `mode: idle` is expected when there are
no established active driver trips; it is **not** evidence of broken tracking.
A result based on a count of aggregate delivery failures is not evidence
of a particular student's status. Check authorized transportation
workflows to diagnose, and do not reproduce locations or names in logs.
Unverified/malformed monitor results are failures, not green checks.
The new check uses existing six-hour fixed-alert deduplication and does
not prove staff actually received the email. Activation and drills are
covered in the operations acceptance checklist.

### Retention backlog alert after activation

When **approved destructive disposal** is enabled in the future, a final batch
that still reaches the 500-record per-class limit produces a fixed
`retention_backlog` operations alert, deduplicated by the established six-hour
UTC window. Treat `provider_accepted` as email-provider acceptance, not verified
inbox receipt or completed disposal. Check subsequent successful runs, source
record age, holds, archive read-back and capacity before declaring the backlog
cleared. A dry-run can remain `saturated: true` repeatedly without altering
rows; it does **not** trigger this alert. Do not activate deletion or bypass a
preservation hold to make the alert stop. Log all response times in UTC and use
`America/Edmonton` for Alberta communications.

## Privacy containment and notification

Use the [breach procedure](../governance/phase-3/breach-response.md) and
[legal-hold procedure](../governance/phase-3/legal-hold-procedure.md).
Record awareness time, data/scope, recipients, harm risks, uncertainty, containment
and who decides each notice. Preserve proportionate restricted evidence; do not
erase records, disable RLS or weaken MFA to investigate. Changes still use the
reviewed protected release/recovery process.

For authority-controlled records, promptly alert its verified responsible contact
and assist its POPA duties. For SafeBus's own PIPA processing, assess its direct
reporting obligation. OIPC guidance distinguishes these frameworks and requires
PIPA reporting without unreasonable delay where a real risk of significant harm
exists. The approved immediate Customer notice commitment is not a substitute for
case-specific statutory reporting duties. Do not wait for a completed forensic report to escalate.
Sources checked 2026-11-05: [OIPC breach reporting](https://oipc.ab.ca/breach-notification/)
and [public-body service providers](https://oipc.ab.ca/resource/popa-guidance-service-providers/).

## Customer updates and closure

Use verified customer contacts and disclose only their scope. Each update states
known impact and start time, uncertainty, safe fallback, action underway and next
update time/contact. Do not claim restoration before verification or publish
student/driver data. Privacy/regulator notices use the applicable required
content and restricted delivery path, separately from operational status messages.

Close with the evidence of restored operation or completed request, remaining
limitations, customer notification, root cause if established and assigned repair
actions. For deletion, distinguish access revocation, primary records, suppliers,
device/offline copies, backups and valid holds. No full-erasure certificate follows
from disabling an account. The live retention control is dry-run; never enable
destructive execution as an incident or support shortcut.

## Ticket retention and acceptance

Keep the minimum case metadata and restricted evidence; limit access and remove
unnecessary attachments. The owner must approve a purpose-based support/incident
retention period, mailbox/provider deletion windows and scoped hold process.
No indefinite retention or arbitrary deletion period is selected here. Review
cases for unnecessary sensitive content while the schedule is being settled.

Acceptance requires a synthetic lost-account request and an outage/privacy
tabletop, including owner absence, verification, wrong-recipient prevention,
legal deadline tracking, safe evidence handling and closure. Use hypothetical
records without production writes or external sends. Record actual participants,
decisions, gaps and remediation in restricted storage; a drafted scenario is not
a passed exercise. Retain only dated non-secret evidence references in Git.

Approvals in privacy/operations readiness remain pending until evidence passes.
No full-restore/DR drill or blanket counsel signature is added by this procedure.

## Subscription setup assistance

Setup support is included with the subscription. Help school authorities with
configuration questions, walkthroughs and authorized setup work using the
[setup-assistance checklist](managed-onboarding.md). Agree the help needed;
request record access or source transfer only when necessary and authorized.
Ongoing maintenance or additional service scope must be agreed separately.

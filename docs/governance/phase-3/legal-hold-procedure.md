# SafeBus Legal and Records Hold Procedure — Draft

**Status:** Scoped controls prepared following owner approval; protected installation and hosted acceptance pending
**Owner:** Business Privacy Lead with Security/Operations and the affected customer

## Purpose and initiation

Preserve specifically required records for a legal duty, access/correction
request, investigation or valid Customer instruction while avoiding indefinite
retention. This procedure does not enable a new database hold mechanism or
authorize changing production records.

The responsible decision-maker verifies the source and authority of the hold,
the affected tenant/classes/time range, legal or operational reason, start date,
review date, release criteria and who may access the preserved material. Consult
qualified advice where needed. Own-business and Customer records are assessed
separately. Do not store court documents, custody narratives or legal advice
in student records or public repository issues.

## Preservation

Operations confirms which approved mechanism can preserve the scoped records
before applying it. Do not disable RLS, pause every tenant's deletion indefinitely
or copy an entire production database into a support ticket. If the available
retention implementation cannot safely honor the hold, escalate that capability
gap and arrange an explicitly reviewed solution before destructive execution.

Keep necessary evidence in controlled storage with access restrictions and an
integrity/chain-of-custody record. Distinguish original records, preserved copies,
backups and investigation notes. Preserve only the data necessary for the reason;
redact other tenants/individuals from review material where possible.

## Review and release

Review by the recorded date and whenever the reason changes. The person who
initiated or lawfully succeeds the authority approves release in writing.
Reconcile pending requests and applicable mandatory retention; then resume the
accepted disposal schedule through a reviewed, scoped workflow. Record the
release, disposition, remaining exceptions and backup expiry. An expired review
date is an escalation, not permission to delete evidence automatically.

## Required evidence

Retain the authority/reference, scope, reason, approver, access list, preservation
verification, review history, release decision and disposal results outside Git.
Before declaring this procedure operational, exercise preservation/release and
retention interaction on an approved target. No hold implementation or completed
exercise is claimed by preparing this draft.

## Prepared application controls (5 November 2026)

School authority and transportation administrators use **Preserve trip records**
on a trip, and **Settings → Preserved records** to review, extend or explicitly
release it. MFA is mandatory; mutations and archive retrieval require recent
sign-in. Platform administrators, guardians, drivers and the retired school-admin
role cannot use these controls. Record only an opaque reference and reason code.

A review cannot reduce the minimum retention date. The selected GPS window ends
at the recorded trip end or the moment of preservation for an ongoing trip;
preserve an additional window if further events require it. Operational source
events for a held trip remain protected. Deleted history cannot be recreated.
An archive disposal already reserved by the worker temporarily rejects a new
preservation request for that trip; no preservation is claimed to have been
created. Refresh and retry, and assess any history already disposed of.

The release record and GPS disposal tombstone remain for 395 days. The worker
rechecks removed objects daily during that window and removes the sample-ID
coverage immediately after successful archive removal. Existing provider backup
windows remain separate. Do not claim immediate erasure from immutable backups.

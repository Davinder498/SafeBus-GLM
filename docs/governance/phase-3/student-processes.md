# SafeBus Alberta — Phase 3 Student and Independent-Student Processes

**Status:** Draft for counsel confirmation
**Owner:** Privacy Lead
**Phase:** 3 — Alberta privacy and legal readiness
**Last updated:** 2026-08-07

---

## 1. Purpose

Phase 3 requires appropriate **student** and **independent-student**
processes. SafeBus handles student information only for transportation
operations under the "track the bus, not the child" rule, so the student
processes are deliberately narrow.

## 2. Students in SafeBus

A "student" in SafeBus is a transportation record: the minimum identity
needed to assign a student to a route/stop and to let a linked guardian see
the assigned bus. SafeBus stores:

- Name fields (first, last, preferred, structured) — for manifest and roster.
- Grade and school — for routing/manifest context.
- Route/stop assignments — transportation linkage only.

SafeBus does **not** store:

- Alberta Student Number / ASN.
- Home address.
- Health data.
- Custody narratives or family-court details.
- Attendance, grades, enrollment, or any SIS data.

## 3. Independent students

An "independent student" generally means a student who exercises their own
education-records rights. SafeBus's processes:

- SafeBus does **not** determine independent-student status; that is the
  customer's responsibility (the school authority).
- The customer tells SafeBus, through the tenant administrator, how to
  treat a given student's access/correction and notification routing.
- SafeBus never assumes a student is or is not independent; it follows the
  customer's documented instruction and records it.

## 4. Guardian linkage (authority to view the bus)

Guardian↔student linkage is the operational authority that lets a guardian
see the bus assigned to a student. The linkage is established by the tenant
administrator based on the customer's verification process — **not** by
collecting custody narratives in SafeBus. See
[`guardian-authority-verification.md`](./guardian-authority-verification.md).

## 5. Notifications about students

Notifications use a guardian's consent flag (`can_receive_notifications`)
and contain only first-name + event type + recorded timestamp in the
tenant's timezone. They never contain location, ASN, address, or health
data, and they describe a recorded transportation event, not live tracking.

## 6. Retention of student records

Student records are retained per [`retention-schedule.md`](./retention-schedule.md)
(while active + grace period, then anonymization/hard delete). Counsel
confirms the period against the Education Act.

## 7. Access and correction for/ about students

Access and correction requests about a student follow
[`access-and-correction.md`](./access-and-correction.md):

- The guardian linked to the student (per the customer's authority) acts
  for a minor student.
- An independent student acts for themselves, per the customer's
  instruction.
- SafeBus never discloses one student's information to an unrelated
  guardian; RLS enforces this.

## 8. Counsel confirmation items

- [ ] Confirm the independent-student handling model in §3.
- [ ] Confirm student-record retention against the Education Act.
- [ ] Confirm guardian-authority verification approach
  ([`guardian-authority-verification.md`](./guardian-authority-verification.md)).
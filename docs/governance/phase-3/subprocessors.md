# SafeBus Alberta — Phase 3 Subprocessor List and Vendor Review

**Status:** Draft — vendors are placeholders until contract review completes
**Owner:** Privacy Lead + Product Owner
**Phase:** 3 — Alberta privacy and legal readiness
**Last updated:** 2026-08-16

---

## 1. Purpose

Phase 3 requires **vendor reviews and agreements** for every subprocessor,
a **public subprocessor list**, and **confirmation of processing and backup
locations**. This document is the internal register; the public list is
derived from it after counsel approval.

## 2. Subprocessor register

| Vendor | Service | Personal data accessed | Processing location | Cross-border? | DPA status | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| **Supabase** | Postgres + Auth | Primary data store: identity, relationships, trips, location, notifications, audit | Intended ca-central-1; verify project and backups | Unverified | Pending | Required by the platform; confirm DPA + processing/backup region in writing |
| **Netlify** | App hosting + Functions | Ephemeral request processing; no at-rest personal data | To confirm (default global edge) | Possibly (edge nodes) | Pending | Configure Functions region; confirm no at-rest personal data |
| **Email provider** (Resend or approved alternative) | Transactional email | Recipient email + notification content in transit | To confirm | Possibly (provider infra) | Pending | Server-side only; recipient resolved from `profiles`/`guardians` |
| **Geoapify** (pilot selection) | Map tiles | Tile coordinates, IP address, HTTP origin/referrer, and ordinary request metadata; no SafeBus account or student identifier | Provider infrastructure; confirm in writing | Possibly | Pending | Free commercial quota is suitable for evaluation. Paid plans publish a 99.5% monthly SLA. Contract, privacy, residency, and paid-plan decisions remain launch gates. |
| **Monitoring / error reporting** (future) | Observability | Potential stack traces / metadata | To confirm | Possibly | Pending | Must scrub personal data before transmission; counsel approval required |
| **Customer support systems** (future) | Support tickets | Support metadata; minimal personal data | To confirm | Possibly | Pending | Configure to exclude direct DB access; tenant-scoped |

> "Pending" means the contract/DPA is not yet executed. No subprocessor
> processes production personal data until its DPA is signed and recorded
> here.

## 3. Review checklist (per vendor)

For each vendor, the Privacy Lead and Product Owner complete:

- [ ] Service description and data accessed (matches §2).
- [ ] Processing and backup location confirmed in writing.
- [ ] DPA executed that flows down POPA/ATIA/PIPA and Education Act
  obligations as applicable.
- [ ] Security schedule (encryption, access control, breach notification).
- [ ] Subprocessor cascading disclosure (vendor's own subprocessors).
- [ ] Data-return and destruction terms.
- [ ] Audit/right-to-inspect terms.
- [ ] Exit/termination plan (how personal data is returned/deleted).

## 4. Canadian processing and backup verification

- The intended production region is **ca-central-1**; project processing and
  backup location must be verified before this can be stated as fact.
- Backups must be in Canada unless counsel approves an exception; the
  Supabase DPA must confirm backup region in writing.
- No personal data is transferred cross-border except:

  - Email content in transit to the email provider (server-side).
  - Potentially map tile requests, which carry **no** personal identifiers.
  - Monitoring/support metadata, which must scrub personal data first.

Any change to processing location requires a `decision-log.md` entry and
PIA update.

## 5. Public subprocessor list

After counsel approval, a public-facing subprocessor list is published
(not part of this codebase) naming the vendors in §2 with their service
and processing location. The list is the authoritative public statement;
this register is the internal source of truth.

## 6. New-vendor process

Adding a subprocessor requires:

1. A row in §2 with the §3 checklist complete.
2. A `decision-log.md` entry.
3. An update to [`data-inventory-and-flow.md`](./data-inventory-and-flow.md)
   §7 if the vendor touches personal data.
4. Counsel approval recorded in [`contract-checklist.md`](./contract-checklist.md).

## 7. Counsel confirmation items

- [ ] Confirm the production processing and backup region for each vendor.
- [ ] Approve each DPA.
- [ ] Approve any cross-border flow (email/map/monitoring/support).

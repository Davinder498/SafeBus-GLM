# SafeBus Data Management, Return and Destruction Schedule — Draft

**Status:** Owner-approved district-controlled model (November 9, 2026); final customer acceptance, workflow verification and supplier/backup evidence pending. **Not executed or published.**

This Schedule forms part of the Customer's accepted SafeBus MSA/DPA when duly published and electronically accepted. Its purpose is simple: the **school authority manages its own transportation records** through the authorized SafeBus controls, while SafeBus handles records and provider copies the Customer cannot directly manage. **No universal mandatory 30-day export or 60-day deletion period applies** under the owner's approved standard proposal. Mandatory law, the authority's records schedule and any accepted customer-specific terms remain controlling.

## 1. District control during service

An active, authorized **school-authority tenant administrator** may access the supported self-service controls for the authority's own records:

- **Download CSV** from the student, guardian, driver and bus directories, using their authorized filters and documented field sets. These downloads are directory snapshots, **not a complete district archive or all trip history**.
- Review or update operational records and use **record-level delete, deactivate or archive actions** where the relevant screen and backend currently support them. Deleting one student or guardian record is not a command to erase all associated independent trip, notification, audit, financial or provider records.
- Use **Records disposal** for the supported retention, preservation, available record-level export and review operations, subject to verified role, session and records restrictions. **Scheduled destructive disposal remains disabled until separately authorized and verified.**

Do not expose cross-tenant data, unrestricted platform browsing, a bulk delete-all endpoint, raw credentials or guardian/driver exports to unauthorized roles. Admin authority and applicable legal permission must be independently checked for sensitive actions. The Customer must not deliberately delete data subject to a known legal/records hold, investigation, request or mandatory minimum retention. SafeBus's safeguards may block otherwise requested deletion where a legal dependency is identified.

## 2. Account closure and remaining records

Subscription cancellation follows the MSA: end of the current trial or paid period unless another binding provision applies. **Canceling billing is not identical to deleting records, and closing access is not a destruction certificate.**

The authorized tenant administrator may request closure or additional return/deletion assistance through the existing SafeBus support channel (info@safebus.kids). Before executing district-wide closure, SafeBus verifies the requester's authority, tenant identity, contract status, outstanding holds and statutory or customer-specific retention duties. Where a requested category is already available through self-service download/deletion, SafeBus should point the administrator to it first instead of requiring a separate paperwork process.

If the school authority needs records outside supported directory exports (for example, approved operational histories or preserved trip records), SafeBus and the authority agree the **lawful scope, secure transfer format and recipient** before any operator-assisted export. No unverified general full-district export feature, automatic closure purge or unconditional completion date is promised. Any customer-specific turnaround obligation must be expressly accepted **only after** SafeBus has tested the applicable process and has the operational capacity to meet it.

For records requiring server/provider operations, SafeBus processes an approved scoped request through tested, tenant-isolated workflows. Normal retention schedules may remove eligible records over time; the owner has **not authorized enabling destructive automatic disposal** merely by approving this contract model. Pending authorized and supported activation, SafeBus must not represent a delete-all feature as available or mark retained records destroyed.

## 3. Legally retained records, dependencies and copies

Deletion remains subject to the Customer's applicable public-body records schedule, decision-use minimums, valid preservation/incident/litigation holds and SafeBus's independently required security, contract, billing and tax records. Preserve the **minimum necessary scope** and review holds rather than retaining all district data indefinitely. Explain relevant categories and expected review or supplier-expiry status to the authority where permitted.

Safeguard separate copies and deletion paths, including:

- Primary database records, dependent relational rows, derived reports and authorization/session state;
- Temporary live-location state and authorized device/offline delivery queues, in-app notifications, and eligible email or push delivery metadata;
- Supabase and other backups, immutable archives, supplier logs, transactional email/push providers, storage and support copies;
- SafeBus's own tax/invoice, contract, audit, incident and legal evidence (which need not follow the same trigger as ordinary transportation records).

The application cannot selectively erase every immutable backup or remotely erase an offline personal device immediately. Provider copies expire or are removed under **verified applicable vendor terms**, not a made-up universal backup window. Do not restore removed records back into active service before reapplying verified deletion, revocation and hold instructions. Any deletion exception must specify its legal/contractual purpose, responsible reviewer and review/expiry trigger; it is not perpetual permission to process the information for a new purpose.

## 4. Export and deletion verification

Supported directory CSV downloads use existing authenticated, tenant-scoped list RPCs and do not include secrets. They are not evidence that **every** district data class has been returned. A requested operator-assisted export requires documented tenant authorization, scoped data classes, secure format, verified recipient and transfer receipt.

SafeBus records the outcome of each assisted closure or deletion operation, including request authority, data classes, action dates, verification, supplier dependencies and lawful retained exceptions. The authority may receive a practical summary of verified results when appropriate, **not a blanket certificate of complete destruction** if provider backups, statutory holds or other copies remain.

The Customer remains responsible for copies it independently downloads or manages. SafeBus retains the obligations required by the accepted DPA, MSA and applicable law. No new automatic deletion worker, signed agreement, customer activation, production migration or readiness approval is created by this draft.

### 4.1 Required completion record

For each assisted exit, enumerate primary records, derived outputs, audit history,
attachments, temporary copies and applicable downstream copies. Record minimum
and maximum retention or expiry triggers, secure destruction method, any hold and
the responsible reviewer. Verify the completeness of the return manifest against
that inventory; a directory-only download cannot close an account-wide request.
The Customer must be able to read and reuse the agreed export without SafeBus's
application. Restrict preserved records to their lawful purpose and access.

Provide a signed or otherwise attributable disposal statement for the verified
scope, dates and method, listing every remaining category with its legal basis,
expiry/review trigger and supplier dependency. Confirm subsequent expiry or
removal separately. Never assert that retained backup copies are destroyed.
Return/disposal arrangements apply to expiry, ordinary termination and termination
for breach, including provider cessation. No new guaranteed universal deadline
or automatic deletion permission is created.

## 5. Final acceptance safeguards

Before presenting an account-wide deletion or guaranteed exit workflow to a real school authority, verify tenant isolation, authorized administrator actions, retention/hold precedence, dependent records, safe export completeness, revocation/session effects, suppliers/backups, and operational completion evidence. Test with **synthetic authorized data**, never by deleting a live authority's records for convenience.

The parties may negotiate a specific return/deletion window or additional assisted export in an accepted customer-specific Order Form. Absent that, this Schedule is **not** a guaranteed 30-day export, 60-day purge, same-day delete-all, instant backup erasure, or waiver of an applicable mandatory retention obligation.


## 6. Approved assisted return — November 11, 2026

Scoped assisted data return is included in the subscription when supported
directory downloads are insufficient; no separate standard assistance fee is
introduced. Follow DPA section 5: acknowledge within two business days and
provide an action plan within five business days, subject to earlier applicable
deadlines. Agree the scope and completion date with the Customer using a tested
process. The accepted order must define the applicable return arrangements before
activation, including secure formats/delivery, retained exceptions and disposal
triggers. This does not guarantee completion within five business days.

Provide a manifest identifying included and excluded record categories, readable
machine-processable files, recipient verification and transfer confirmation.
Then report verified deletion actions separately from retained exceptions and
provider expiry. The operator-assisted manifest process is documented in the
[scoped return runbook](../../../operations/assisted-data-return.md). Its synthetic
checks cover exact requested scope, tenant mismatch, incomplete files, tampering
and delivery evidence. A customer-specific transfer channel and recipient must
still be verified before the actual transfer; these tests are not a completed
customer export or a full-account return guarantee.
The approved self-service model, lawful holds and prohibition on unapproved
automatic destructive disposal remain unchanged.

# Data Return and Destruction Schedule — Draft

**Status:** Proposed exit obligations; periods and execution capability unapproved

## Trigger and authority

This schedule applies to termination, an approved customer return/deletion request
or expiry of the applicable retention purpose. Verify the requester and its
authority, identify affected tenant/data classes, assess holds and protect other
customers. Account disablement is not a certificate of data destruction.

## Return

Proposed return window: the Customer may request a return within 30 calendar days
of termination. Agree the format, scope, timing, transfer mechanism and any
approved extraordinary work charges before activation. A draft commitment does
not establish that a general export feature exists.

Use a documented, secure, tenant-scoped operator process whose authorization and
output were tested. Proposed output: agreed interoperable UTF-8 tabular/JSON
records and an explanatory schema for the Customer's permitted operational
data, without credentials, another tenant's information or excluded vendor data.
Do not expose a bulk export to guardians or grant broad platform browsing access
to implement this schedule. Verify recipient, integrity and transfer receipt.

## Primary deletion and anonymization

Proposed primary-data completion: within 60 calendar days of termination or
completion of the agreed return, using the accepted trigger. Before signing,
define exactly which event starts that window and demonstrate feasible disposal
of each data class. A valid legal/records hold or mandatory retention exception
must be scoped, documented and explained to the Customer; no indefinite generic
hold is permitted by this draft.

Revoke access and sessions/device registrations through the approved workflow.
Separately dispose of database records, permitted derived data, active caches,
device/offline data where controllable, email/provider records, support copies
and files. Track exceptions and supplier-dependent actions. Device deletion and
revocation while offline require disclosed, tested limits; do not promise an
instant remote wipe of a personally owned phone.

## Backups and restoration

The parties approve `[BACKUP_RETENTION_WINDOW]` and each supplier's deletion/log
window. Primary deletion does not selectively erase an immutable backup. Restrict
backup access, expire copies under the agreed schedule and identify those copies
in the disposal evidence. A separate evidence/financial record may be retained
only for a documented purpose and period.

Before restoring deleted personal information into normal service, reapply
verified deletion/revocation/hold instructions and validate them. Perform
recovery tests only under the approved database workflow; do not restore or reset
the sole production database as a drafting or QA step.

## Confirmation

Provide a scoped completion record: instruction/authority reference, data classes,
methods and dates, transfer receipt, system/supplier coverage, verification,
remaining backup/hold exceptions and expiry/review dates, and responsible reviewer.
Do not claim complete destruction if only account access was removed. Store
customer evidence confidentially; the repository keeps only non-secret references.

The Customer's own exported records become its responsibility under its privacy
program. SafeBus continues necessary confidentiality and lawful exception duties
after exit. Final periods, export capability, deletion tests and supplier evidence
are acceptance dependencies, not activated by this document.

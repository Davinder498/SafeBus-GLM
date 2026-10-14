# SafeBus Guardian-Authority Verification — Draft

**Status:** Proposed process; customer verification and hosted acceptance pending
**Owner:** Customer privacy/transport office with SafeBus Privacy/Security
**Last updated:** 2026-10-13

The customer determines which person is authorized for a student's transport
information using its own lawful process. SafeBus records the resulting minimum
operational relationship and authorized changes, rather than custody narratives
or court evidence. This is customer-data authorization, not permission for the
owner to own or develop SafeBus.

1. At onboarding the customer identifies its authorized decision-maker, process
   and instructions. Evidence stays in its appropriate controlled system.
2. An authorized tenant operator creates the link using the approved scoped
   workflow. Store only necessary identity/relationship, creator/time and
   permitted active/expiry information; verify exact installed fields.
3. Authoritative permissions must use current same-tenant link and trip/assignment
   scope. Guardian-supplied IDs, possession of a URL or an old cache do not grant
   authority.
4. On a change, the customer promptly instructs removal/expiry through the
   authorized workflow and records the event. Verify resulting REST/RPC, open
   realtime, email and native/session behavior. Do not promise immediate removal
   from an offline device or existing socket without evidence.
5. Re-establishment requires a new verified instruction and authorized action;
   do not automatically restore removed authority.

Disputes are handled by the customer; SafeBus neither adjudicates custody nor
stores the narrative in student notes. A guardian's app link is not by itself
proof of authority for an access request. Use the
[student procedure](student-processes.md) and
[access/correction procedure](access-and-correction.md) for statutory requests.

Before claiming this process operational, retain customer authority/instructions,
role/field review, bounded direct allow/deny tests with active/inactive/expired
links and the revocation/delivery results. Existing S2/S3 security findings remain
open where hosted evidence is missing. Privacy decisions and sensitive supporting
records stay outside Git; only non-secret evidence references enter launch records.

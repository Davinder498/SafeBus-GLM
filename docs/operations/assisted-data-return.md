# Scoped assisted data return

This operator process supplements existing directory downloads and Records disposal.
It assembles explicitly requested record IDs through the existing authenticated
export endpoint. It is not a full-district archive, automatic email delivery,
independent identity verification or deletion tool.

## Authority and scope

1. Confirm the requesting school-authority administrator through the existing
   signed-in account and agreed contact route. Record an internal case reference,
   authorization reference and recipient verification evidence in restricted case
   storage. Never request a password, session token or MFA code in a support ticket.
2. Agree categories, explicit record IDs, readable JSON format, completion date
   and the authority-approved encrypted transfer method. Inventory exclusions:
   other primary records, related rows/history, attachments, derived outputs,
   audit/legal records, provider copies and backups. An omission is an exclusion,
   not proof that no such records exist. Split requests over 500 records into
   numbered packages and reconcile the overall inventory before closing the case.
3. Review preservation and minimum-retention rules. Exporting does not release a
   hold. Record retained categories, lawful purposes, responsible reviewers and
   known expiry/review triggers. Mark unknown provider expiry as unresolved; do not
   make up a date. Agree handling of any excluded requested category before delivery.
4. Use the actual tenant administrator's authorized session on their controlled
   workstation, or an individually provisioned, explicitly authorized scoped
   assistance account. The existing server enforces role, tenant, MFA, active
   session and recent sign-in. Platform-super-admin access remains aggregate-only;
   this script grants no additional access. School-scoped admins, guardians and
   drivers cannot use this process; operational admins retain only their existing
   limited record-export permissions. Standard assisted-return authorization is
   obtained from the tenant administrator, not inferred from a transport role.

## Prepare and verify

Use Node 24 and `scripts/assisted-return.mjs`. Keep the request, token and output
outside Git and CI on an access-controlled encrypted workstation. Set
`SAFEBUS_RETURN_ACCESS_TOKEN` through the workstation's secure session mechanism;
do not put its value in command arguments, chat, logs or committed files. Clear
it immediately after execution. The token is sent only to the fixed SafeBus export
endpoint; redirects are refused. No service-role credential is used.

Request JSON schema (all references point to retained case evidence, not names or
sensitive incident descriptions):

```json
{
  "version": 1,
  "tenantId": "11111111-1111-4111-8111-111111111111",
  "requestReference": "CASE-EXAMPLE",
  "authorizationReference": "AUTH-EXAMPLE",
  "recipientVerificationReference": "RECIPIENT-EXAMPLE",
  "holdReviewReference": "HOLD-REVIEW-EXAMPLE",
  "operatorReference": "OPERATOR-EXAMPLE",
  "scope": "The explicitly requested trip record only",
  "deliveryMethod": "Customer-approved encrypted transfer; details in case record",
  "completionDueAt": "2026-12-01T18:00:00Z",
  "records": [{"policy": "trip_records", "recordId": "22222222-2222-4222-8222-222222222222"}],
  "exclusions": [{"category": "Other records, derived outputs, attachments and provider copies", "reason": "Outside this explicitly agreed scope; assess separately if requested"}],
  "retainedExceptions": [{"category": "Source record and applicable backups", "purpose": "Return does not authorize destruction; applicable schedule and holds remain", "reviewOrExpiryTrigger": "Review under the approved record schedule; unresolved provider expiry separately identified in case", "reviewerReference": "OPERATOR-EXAMPLE"}]
}
```

Run `node scripts/assisted-return.mjs prepare /private/request.json /private/NEW-package`.
The directory must not exist. Every requested record must succeed and match the
selected authority/record ID; secret-like fields, denied access, duplicates,
unknown policies and missing review references stop preparation. Review unexpected
secret-field denials rather than weakening the check. Requests are paced below
the endpoint limit; a 429 or expired session stops the operation, with no automatic
retry or partial-success claim. A filesystem failure can leave an incomplete
folder: do not deliver any folder without a complete manifest and checksum review.

JSON preserves UTF-8 and can be read without SafeBus. The manifest lists each file,
its byte length and SHA-256, exclusions and retained exceptions. The status is
`prepared_not_delivered`. Check the complete manifest against the agreed inventory,
not just file count. Store package evidence securely; never attach student records
to public GitHub issues, ordinary support email or public links.

## Delivery and closure

Use the agreed encrypted transfer method and independently verified recipient.
Record transfer evidence and recipient acknowledgement in restricted case storage.
No transfer channel is provisioned by this script; verify the selected channel
before promising it. Create a receipt JSON with `manifestSha256` from preparation,
`recipientVerificationReference` matching the request, `transferEvidenceReference`,
`recipientAcknowledgementReference`, `operatorReference` and ISO `deliveredAt`.

Run `node scripts/assisted-return.mjs confirm /private/package /private/receipt.json`.
The script rechecks every file hash/length and manifest digest, recipient reference,
acknowledgement and dates, then creates a non-overwriting `delivery-record.json`.
This is an attributable operator record, not cryptographic proof of recipient identity.
A completion record cannot mark deletion complete: no deletion occurs in this process.
Report actual disposal separately with evidence and retained exceptions. Remove
workstation/transfer copies under the agreed case retention rule and record removal;
never certify provider backup erasure without evidence.

## Verification and limits

`tests/release/assisted-return.test.mjs` uses synthetic data to test UTF-8 fidelity,
exact scope, cross-authority/record mismatch, secret-field rejection, incomplete
exports, missing authority/recipient/hold review, tampering and delivery evidence.
Existing isolated PostgreSQL disposal tests cover server role/MFA/session/tenant
boundaries. No live customer export or customer transfer is claimed by these tests.
Before an actual request, verify the chosen secure transfer channel and recipient;
no universal full-account or fixed completion-time promise is introduced.

import { createHash } from 'node:crypto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
export const RETURN_POLICIES = new Set([
  'student_records',
  'guardian_relationships',
  'driver_records',
  'guardian_records',
  'invitations',
  'trip_records',
  'bus_run_dispatches',
  'announcements',
]);
export const digest = (value) => createHash('sha256').update(value).digest('hex');
const requireValue = (condition, code) => {
  if (!condition) throw new Error(code);
};
const reference = (value) => typeof value === 'string' && REFERENCE.test(value);
const text = (value) =>
  typeof value === 'string' && value.trim().length > 0 && value.length <= 2000;
function checkRecord(value, tenantId) {
  requireValue(
    value && typeof value === 'object' && !Array.isArray(value),
    'RETURN_INVALID_RECORD',
  );
  requireValue(value.tenant_id === tenantId, 'RETURN_AUTHORITY_MISMATCH');
  const visit = (item) => {
    if (!item || typeof item !== 'object') return;
    for (const [key, child] of Object.entries(item)) {
      requireValue(
        !/(password|secret|token|credential|private_key)/i.test(key),
        'RETURN_SECRET_FIELD',
      );
      if (key === 'tenant_id') requireValue(child === tenantId, 'RETURN_AUTHORITY_MISMATCH');
      visit(child);
    }
  };
  visit(value);
}
export function validateReturnRequest(request) {
  requireValue(
    request?.version === 1 && UUID.test(request.tenantId ?? ''),
    'RETURN_INVALID_REQUEST',
  );
  for (const field of [
    'requestReference',
    'authorizationReference',
    'recipientVerificationReference',
    'holdReviewReference',
    'operatorReference',
  ])
    requireValue(reference(request[field]), 'RETURN_REQUIRED_REVIEW_REFERENCE');
  requireValue(
    text(request.scope) && text(request.deliveryMethod),
    'RETURN_SCOPE_AND_DELIVERY_REQUIRED',
  );
  requireValue(
    Number.isFinite(Date.parse(request.completionDueAt)),
    'RETURN_COMPLETION_DATE_REQUIRED',
  );
  requireValue(
    Array.isArray(request.records) && request.records.length > 0 && request.records.length <= 500,
    'RETURN_BOUNDED_SCOPE_REQUIRED',
  );
  const unique = new Set();
  for (const row of request.records) {
    requireValue(
      RETURN_POLICIES.has(row.policy) && UUID.test(row.recordId ?? ''),
      'RETURN_UNSUPPORTED_RECORD',
    );
    const key = `${row.policy}:${row.recordId}`;
    requireValue(!unique.has(key), 'RETURN_DUPLICATE_RECORD');
    unique.add(key);
  }
  requireValue(
    Array.isArray(request.exclusions) && request.exclusions.length > 0,
    'RETURN_EXCLUSIONS_REQUIRED',
  );
  for (const row of request.exclusions)
    requireValue(text(row.category) && text(row.reason), 'RETURN_EXCLUSION_REASON_REQUIRED');
  requireValue(
    Array.isArray(request.retainedExceptions) && request.retainedExceptions.length > 0,
    'RETURN_RETAINED_EXCEPTIONS_REQUIRED',
  );
  for (const row of request.retainedExceptions)
    requireValue(
      text(row.category) &&
        text(row.purpose) &&
        text(row.reviewOrExpiryTrigger) &&
        reference(row.reviewerReference),
      'RETURN_EXCEPTION_REVIEW_REQUIRED',
    );
}
export async function prepareReturn(request, exportRecord, now = new Date().toISOString()) {
  validateReturnRequest(request);
  requireValue(Number.isFinite(Date.parse(now)), 'RETURN_INVALID_DATE');
  const files = [];
  // Sequential, bounded requests avoid bulk-reading an authority and respect existing rate limits.
  for (const selected of request.records) {
    const record = await exportRecord(selected);
    checkRecord(record, request.tenantId);
    requireValue(record.id === selected.recordId, 'RETURN_RECORD_MISMATCH');
    const content = JSON.stringify(record, null, 2) + '\n';
    files.push({
      name: `${selected.policy}-${selected.recordId}.json`,
      policy: selected.policy,
      recordId: selected.recordId,
      sha256: digest(content),
      bytes: Buffer.byteLength(content),
      content,
    });
  }
  const manifest = {
    version: 1,
    status: 'prepared_not_delivered',
    preparedAt: now,
    tenantId: request.tenantId,
    requestReference: request.requestReference,
    authorizationReference: request.authorizationReference,
    operatorReference: request.operatorReference,
    recipientVerificationReference: request.recipientVerificationReference,
    holdReviewReference: request.holdReviewReference,
    scope: request.scope,
    completionDueAt: request.completionDueAt,
    deliveryMethod: request.deliveryMethod,
    completeness: 'All explicitly requested record IDs returned; not a full authority archive.',
    files: files.map(({ content: _content, ...entry }) => entry),
    exclusions: request.exclusions,
    retainedExceptions: request.retainedExceptions,
    deletion: {
      performed: false,
      statement: 'Export only. No deletion or release of preservation was performed.',
    },
  };
  return { manifest, files };
}
export function confirmReturnDelivery(manifest, files, receipt) {
  requireValue(
    manifest?.status === 'prepared_not_delivered' && manifest.version === 1,
    'RETURN_INVALID_MANIFEST',
  );
  requireValue(
    Array.isArray(files) && files.length === manifest.files.length,
    'RETURN_INCOMPLETE_FILES',
  );
  const expected = new Map(manifest.files.map((file) => [file.name, file]));
  requireValue(expected.size === files.length, 'RETURN_DUPLICATE_FILE');
  for (const file of files) {
    const entry = expected.get(file.name);
    requireValue(
      entry &&
        digest(file.content) === entry.sha256 &&
        Buffer.byteLength(file.content) === entry.bytes,
      'RETURN_FILE_MISMATCH',
    );
    expected.delete(file.name);
  }
  requireValue(expected.size === 0, 'RETURN_INCOMPLETE_FILES');
  requireValue(
    receipt?.manifestSha256 === digest(JSON.stringify(manifest, null, 2) + '\n'),
    'RETURN_MANIFEST_MISMATCH',
  );
  requireValue(
    receipt.recipientVerificationReference === manifest.recipientVerificationReference,
    'RETURN_RECIPIENT_MISMATCH',
  );
  requireValue(
    reference(receipt.transferEvidenceReference) &&
      reference(receipt.recipientAcknowledgementReference) &&
      reference(receipt.operatorReference),
    'RETURN_DELIVERY_EVIDENCE_REQUIRED',
  );
  requireValue(
    Number.isFinite(Date.parse(receipt.deliveredAt)) &&
      Date.parse(receipt.deliveredAt) >= Date.parse(manifest.preparedAt) &&
      Date.parse(receipt.deliveredAt) <= Date.now(),
    'RETURN_INVALID_DELIVERY_DATE',
  );
  return {
    version: 1,
    status: 'delivery_recorded',
    requestReference: manifest.requestReference,
    tenantId: manifest.tenantId,
    manifestSha256: receipt.manifestSha256,
    deliveredAt: receipt.deliveredAt,
    recipientVerificationReference: receipt.recipientVerificationReference,
    transferEvidenceReference: receipt.transferEvidenceReference,
    recipientAcknowledgementReference: receipt.recipientAcknowledgementReference,
    operatorReference: receipt.operatorReference,
    retainedExceptions: manifest.retainedExceptions,
    exclusions: manifest.exclusions,
    deletion: manifest.deletion,
    statement:
      'Operator-recorded delivery of the listed scope only; not independent proof of recipient identity or a destruction certificate.',
  };
}

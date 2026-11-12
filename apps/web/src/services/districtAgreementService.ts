import { supabase, supabaseConfigError } from '@/lib/supabase';

export interface AgreementDocument {
  id: string;
  kind: string;
  title: string;
  version: string;
  sha256: string;
  body: string;
}
export interface DistrictAgreement {
  id?: string;
  status: string;
  version?: string;
  revision?: number;
  tenant_name: string;
  bundle_sha256?: string;
  issued_at?: string;
  customer_signed_at?: string | null;
  receipt_id?: string | null;
  documents: AgreementDocument[];
  order_required?: boolean;
  order_details?: DistrictOrder | null;
}
export interface DistrictOrder {
  interval: 'month' | 'year';
  quantity: number;
  collection_method: 'charge_automatically' | 'send_invoice';
  privacy_contact: string;
  urgent_contact: string;
}
export interface AgreementReceiptSummary {
  id: string;
  signed_at: string;
  receipt_sha256: string;
  bundle_sha256: string;
  actor_email: string;
}
export interface PlatformAgreementSummary {
  receipts?: AgreementReceiptSummary[];
  id?: string;
  status: string;
  version?: string;
  issued_at?: string;
  customer_signed_at?: string | null;
  signer_profile_id?: string | null;
}
export interface AgreementReceipt {
  id: string;
  signed_at: string;
  bundle_sha256: string;
  receipt_sha256: string;
  document_snapshot: {
    customer: string;
    provider: string;
    package_id: string;
    revision: number;
    signer: { user_id: string; email: string; name: string; title: string };
    documents: AgreementDocument[];
    accepted_at: string;
  };
}
export interface AgreementDocumentVersion {
  id: string;
  kind: string;
  title: string;
  version: string;
  sha256: string;
  approved_at: string;
}
export interface AgreementCatalog {
  status?: string;
  revision?: number;
  document_ids?: string[];
  published_at?: string;
  content_sha256?: string;
}
function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase not configured.');
  return supabase;
}
function requireObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Unexpected agreement response.');
  }
  return value as Record<string, unknown>;
}
function missingRpc(error: { code?: string }) {
  return error.code === 'PGRST202' || error.code === '42883';
}
async function callRpc(name: string, args?: Record<string, unknown>) {
  // Forward-declared RPCs are approved in config/pending/district-agreement-authorization.json.
  const { data, error } = await client().rpc(name as 'get_my_district_agreement', args as never);
  if (error) {
    if (missingRpc(error)) throw new Error('Agreement setup is not deployed. Contact SafeBus.');
    throw new Error(error.message ?? 'Agreement request failed. Refresh the current status.');
  }
  return requireObject(data);
}
export async function getDistrictAgreement(): Promise<DistrictAgreement> {
  const { data, error } = await client().rpc('get_my_district_agreement');
  if (error) {
    if (missingRpc(error))
      throw new Error('Agreement service is not deployed. Contact SafeBus support.');
    throw new Error('Unable to securely load the agreement. Please retry.');
  }
  const value = requireObject(data);
  const docs = Array.isArray(value.documents) ? value.documents : [];
  return {
    tenant_name: typeof value.tenant_name === 'string' ? value.tenant_name : 'School authority',
    status: typeof value.status === 'string' ? value.status : 'not_issued',
    id: typeof value.id === 'string' ? value.id : undefined,
    version: typeof value.version === 'string' ? value.version : undefined,
    revision: typeof value.revision === 'number' ? value.revision : undefined,
    bundle_sha256: typeof value.bundle_sha256 === 'string' ? value.bundle_sha256 : undefined,
    issued_at: typeof value.issued_at === 'string' ? value.issued_at : undefined,
    customer_signed_at:
      typeof value.customer_signed_at === 'string' ? value.customer_signed_at : null,
    receipt_id: typeof value.receipt_id === 'string' ? value.receipt_id : null,
    order_required: value.order_required === true,
    order_details:
      value.order_details && typeof value.order_details === 'object'
        ? (value.order_details as unknown as DistrictOrder)
        : null,
    documents: docs.filter(
      (d): d is AgreementDocument =>
        typeof d === 'object' &&
        d !== null &&
        typeof d.body === 'string' &&
        typeof d.sha256 === 'string' &&
        typeof d.title === 'string' &&
        typeof d.kind === 'string' &&
        typeof d.version === 'string' &&
        typeof d.id === 'string',
    ),
  };
}
export async function prepareDistrictAgreementOrder(
  id: string,
  order: DistrictOrder,
): Promise<void> {
  await callRpc('prepare_my_district_agreement_order', { p_package_id: id, p_order: order });
}
export async function getPlatformAgreement(tenantId: string): Promise<PlatformAgreementSummary> {
  const { data, error } = await client().rpc('get_platform_district_agreement', {
    p_tenant_id: tenantId,
  });
  if (error) {
    if (missingRpc(error))
      throw new Error('Agreement service is not deployed. Contact SafeBus support.');
    throw new Error('Unable to securely load contract status.');
  }
  const value = requireObject(data);
  return {
    id: typeof value.id === 'string' ? value.id : undefined,
    status: typeof value.status === 'string' ? value.status : 'not_issued',
    version: typeof value.version === 'string' ? value.version : undefined,
    issued_at: typeof value.issued_at === 'string' ? value.issued_at : undefined,
    customer_signed_at:
      typeof value.customer_signed_at === 'string' ? value.customer_signed_at : null,
    signer_profile_id: typeof value.signer_profile_id === 'string' ? value.signer_profile_id : null,
    receipts: Array.isArray(value.receipts)
      ? (value.receipts as unknown as AgreementReceiptSummary[])
      : undefined,
  };
}
export async function acceptDistrictAgreement(input: {
  id: string;
  digest: string;
  name: string;
  title: string;
  electronicConsent: boolean;
  authorityAttested: boolean;
  signatureIntent: boolean;
}) {
  return callRpc('accept_my_district_agreement', {
    p_package_id: input.id,
    p_bundle_sha256: input.digest,
    p_signer_name: input.name,
    p_signer_title: input.title,
    p_electronic_consent: input.electronicConsent,
    p_authority_attested: input.authorityAttested,
    p_signature_intent: input.signatureIntent,
  });
}
export async function listMyAgreementReceipts(): Promise<
  Array<{
    id: string;
    signed_at: string;
    receipt_sha256: string;
    bundle_sha256: string;
    actor_email: string;
  }>
> {
  const { data, error } = await client().rpc('list_my_district_agreement_receipts');
  if (error && missingRpc(error))
    throw new Error('Agreement archive service is not deployed. Contact SafeBus support.');
  if (error) throw new Error('Unable to load contract archive.');
  if (!Array.isArray(data)) throw new Error('Unexpected contract archive response.');
  return data as Array<{
    id: string;
    signed_at: string;
    receipt_sha256: string;
    bundle_sha256: string;
    actor_email: string;
  }>;
}
export async function getAgreementReceipt(receiptId: string): Promise<AgreementReceipt> {
  return callRpc('get_my_district_agreement_receipt', {
    p_receipt_id: receiptId,
  }) as unknown as AgreementReceipt;
}

const requiredDocumentKinds = new Set([
  'msa',
  'dpa',
  'order_form',
  'security',
  'sla',
  'acceptable_use',
  'data_return',
  'suppliers',
]);

/** Presentation guard only; the database independently verifies scope and hashes. */
export function isCompleteDistrictAgreement(agreement: DistrictAgreement | null): boolean {
  if (!agreement?.id || !/^[0-9a-f]{64}$/.test(agreement.bundle_sha256 ?? '')) return false;
  const docs = agreement.documents;
  return (
    docs.length === requiredDocumentKinds.size &&
    new Set(docs.map((doc) => doc.kind)).size === requiredDocumentKinds.size &&
    new Set(docs.map((doc) => doc.id)).size === requiredDocumentKinds.size &&
    docs.every(
      (doc) =>
        requiredDocumentKinds.has(doc.kind) &&
        doc.id.trim() &&
        doc.title.trim() &&
        doc.version.trim() &&
        doc.body.trim() &&
        /^[0-9a-f]{64}$/.test(doc.sha256),
    )
  );
}

/**
 * The receipt snapshot is the canonical UTF-8 source. The complementary PDF
 * currently uses an ASCII-compatible font and may approximate Unicode text.
 * JSON strings preserve each signed document body exactly, including accented
 * school-authority names and non-Latin writing.
 */
export function serializeExecutedAgreementArchive(receipt: AgreementReceipt): string {
  const snapshot = receipt?.document_snapshot;
  const documents = snapshot?.documents;
  if (
    !receipt?.id ||
    !receipt.signed_at ||
    !/^[0-9a-f]{64}$/.test(receipt.bundle_sha256 ?? '') ||
    !/^[0-9a-f]{64}$/.test(receipt.receipt_sha256 ?? '') ||
    !Array.isArray(documents) ||
    documents.length !== requiredDocumentKinds.size ||
    new Set(documents.map((doc) => doc?.kind)).size !== requiredDocumentKinds.size ||
    documents.some(
      (doc) =>
        !doc ||
        !requiredDocumentKinds.has(doc.kind) ||
        typeof doc.body !== 'string' ||
        doc.body.trim().length === 0 ||
        typeof doc.title !== 'string' ||
        typeof doc.version !== 'string' ||
        !/^[0-9a-f]{64}$/.test(doc.sha256),
    )
  ) {
    throw new Error('Executed agreement archive is incomplete. Contact SafeBus support.');
  }
  return (
    JSON.stringify(
      {
        format: 'safebus-executed-agreement-utf8-v1',
        receipt_id: receipt.id,
        signed_at: receipt.signed_at,
        bundle_sha256: receipt.bundle_sha256,
        receipt_sha256: receipt.receipt_sha256,
        document_snapshot: snapshot,
      },
      null,
      2,
    ) + '\n'
  );
}

/** Download the authenticated, exact UTF-8 snapshot. No public file bucket. */
export async function downloadExecutedAgreementArchive(receiptId: string): Promise<void> {
  const receipt = await getAgreementReceipt(receiptId);
  const data = new Blob([serializeExecutedAgreementArchive(receipt)], {
    type: 'application/json;charset=utf-8',
  });
  const url = URL.createObjectURL(data);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = `SafeBus-Executed-Agreement-${receiptId}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
export async function downloadExecutedAgreementPdf(receiptId: string): Promise<void> {
  const {
    data: { session },
  } = await client().auth.getSession();
  if (!session?.access_token) throw new Error('Sign in to download your executed agreement.');
  const response = await fetch('/.netlify/functions/district-agreement-pdf', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${session.access_token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ receiptId }),
  });
  if (!response.ok) {
    const result: unknown = await response.json().catch(() => null);
    const message =
      result && typeof result === 'object' && 'error' in result
        ? String((result as { error: unknown }).error)
        : 'Could not download the executed agreement.';
    throw new Error(message);
  }
  const data = await response.blob();
  if (!data.size || data.type !== 'application/pdf') throw new Error('Invalid document response.');
  const url = URL.createObjectURL(data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `SafeBus-Executed-Agreement-${receiptId}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function listPlatformAgreementDocuments(): Promise<AgreementDocumentVersion[]> {
  const { data, error } = await client().rpc('platform_list_agreement_documents');
  if (error) throw new Error('Unable to load approved document versions.');
  if (!Array.isArray(data)) throw new Error('Unexpected document list.');
  return data.flatMap((item): AgreementDocumentVersion[] => {
    if (
      typeof item !== 'object' ||
      item === null ||
      Array.isArray(item) ||
      typeof item.id !== 'string' ||
      typeof item.kind !== 'string' ||
      typeof item.title !== 'string' ||
      typeof item.version !== 'string' ||
      typeof item.sha256 !== 'string' ||
      typeof item.approved_at !== 'string'
    )
      return [];
    return [
      {
        id: item.id,
        kind: item.kind,
        title: item.title,
        version: item.version,
        sha256: item.sha256,
        approved_at: item.approved_at,
      },
    ];
  });
}
export async function getPlatformAgreementCatalog(): Promise<AgreementCatalog> {
  return callRpc('platform_get_agreement_catalog') as AgreementCatalog;
}
export async function publishAgreementDocument(input: {
  kind: string;
  title: string;
  version: string;
  body: string;
}) {
  return callRpc('platform_publish_agreement_document', {
    p_kind: input.kind,
    p_title: input.title,
    p_version: input.version,
    p_body: input.body,
  });
}
export async function publishAgreementCatalog(ids: string[]) {
  return callRpc('platform_publish_agreement_catalog', { p_document_ids: ids });
}

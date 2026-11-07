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
  tenant_name: string;
  bundle_sha256?: string;
  issued_at?: string;
  expires_at?: string;
  signer_profile_id?: string | null;
  authority_verified?: boolean;
  customer_signed_at?: string | null;
  provider_signed_at?: string | null;
  documents: AgreementDocument[];
}

export interface PlatformAgreementSummary {
  id?: string;
  status: string;
  version?: string;
  issued_at?: string;
  expires_at?: string;
  authority_verified?: boolean;
  signer_profile_id?: string | null;
  customer_signed_at?: string | null;
  provider_signed_at?: string | null;
  pending_officer_requests?: number;
}

function client() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'Supabase not configured.');
  return supabase;
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Unexpected agreement status response.');
  }
  return value as Record<string, unknown>;
}

function isMissingRpc(error: { code?: string; message?: string }): boolean {
  return error.code === 'PGRST202' || error.code === '42883';
}

// The staged contract migration may not be deployed yet; never simulate an
// issued agreement or permit a local-only signature as a fallback.
export async function getDistrictAgreement(): Promise<DistrictAgreement> {
  const { data, error } = await client().rpc('get_my_district_agreement');
  if (error) {
    if (isMissingRpc(error)) return { status: 'not_issued', tenant_name: 'School authority', documents: [] };
    throw new Error('Unable to securely load the agreement. Please retry.');
  }
  const result = asObject(data);
  return {
    status: String(result.status ?? 'not_issued'),
    tenant_name: typeof result.tenant_name === 'string' ? result.tenant_name : 'School authority',
    id: typeof result.id === 'string' ? result.id : undefined,
    version: typeof result.version === 'string' ? result.version : undefined,
    bundle_sha256: typeof result.bundle_sha256 === 'string' ? result.bundle_sha256 : undefined,
    issued_at: typeof result.issued_at === 'string' ? result.issued_at : undefined,
    expires_at: typeof result.expires_at === 'string' ? result.expires_at : undefined,
    signer_profile_id: typeof result.signer_profile_id === 'string' ? result.signer_profile_id : null,
    authority_verified: result.authority_verified === true,
    customer_signed_at: typeof result.customer_signed_at === 'string' ? result.customer_signed_at : null,
    provider_signed_at: typeof result.provider_signed_at === 'string' ? result.provider_signed_at : null,
    documents: Array.isArray(result.documents)
      ? result.documents.filter((item): item is AgreementDocument =>
          item !== null && typeof item === 'object'
          && typeof (item as AgreementDocument).body === 'string'
          && typeof (item as AgreementDocument).sha256 === 'string'
          && typeof (item as AgreementDocument).title === 'string')
      : [],
  };
}

export async function getPlatformAgreement(tenantId: string): Promise<PlatformAgreementSummary> {
  const { data, error } = await client().rpc('get_platform_district_agreement', {
    p_tenant_id: tenantId,
  });
  if (error) {
    if (isMissingRpc(error)) return { status: 'not_issued' };
    throw new Error('Unable to securely load contract status.');
  }
  const result = asObject(data);
  return {
    id: typeof result.id === 'string' ? result.id : undefined,
    status: String(result.status ?? 'not_issued'),
    version: typeof result.version === 'string' ? result.version : undefined,
    issued_at: typeof result.issued_at === 'string' ? result.issued_at : undefined,
    expires_at: typeof result.expires_at === 'string' ? result.expires_at : undefined,
    authority_verified: result.authority_verified === true,
    signer_profile_id: typeof result.signer_profile_id === 'string' ? result.signer_profile_id : null,
    customer_signed_at: typeof result.customer_signed_at === 'string' ? result.customer_signed_at : null,
    provider_signed_at: typeof result.provider_signed_at === 'string' ? result.provider_signed_at : null,
    pending_officer_requests: typeof result.pending_officer_requests === 'number'
      ? result.pending_officer_requests : 0,
  };
}

async function agreementAction(name: string, args: Record<string, unknown>) {
  const { data, error } = await client().rpc(name as 'get_my_district_agreement', args as never);
  if (error) throw new Error(error.message ?? 'The agreement request was not confirmed.');
  return asObject(data);
}

export async function acknowledgeAgreement(id: string, digest: string) {
  return agreementAction('acknowledge_district_agreement_review', {
    p_package_id: id, p_bundle_sha256: digest,
  });
}

export async function requestOfficer(id: string, digest: string, name: string, email: string) {
  return agreementAction('request_district_agreement_signer', {
    p_package_id: id, p_bundle_sha256: digest,
    p_officer_name: name, p_officer_email: email, p_external_process: false,
  });
}

export async function requestExternalProcess(id: string, digest: string) {
  return agreementAction('request_district_agreement_signer', {
    p_package_id: id, p_bundle_sha256: digest, p_external_process: true,
  });
}

export async function signDistrictAgreement(input: {
  id: string; digest: string; name: string; title: string;
  electronicConsent: boolean; signatureIntent: boolean;
}) {
  return agreementAction('customer_sign_district_agreement', {
    p_package_id: input.id, p_bundle_sha256: input.digest,
    p_signer_name: input.name, p_signer_title: input.title,
    p_electronic_consent: input.electronicConsent,
    p_signature_intent: input.signatureIntent,
  });
}

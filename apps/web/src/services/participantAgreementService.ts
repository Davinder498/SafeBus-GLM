import { supabase, supabaseConfigError } from '@/lib/supabase';

export interface ParticipantTermsDocument {
  id: string;
  title: string;
  version: string;
  sha256: string;
  body: string;
}

export interface ParticipantAgreementStatus {
  required: boolean;
  status: 'grandfathered' | 'not_published' | 'pending' | 'accepted';
  terms?: ParticipantTermsDocument;
  notice?: { url: string; version: string };
  accepted_at?: string | null;
}

export interface PublishedParticipantTerms {
  status: 'published' | 'not_published';
  document_id?: string;
  version?: string;
  sha256?: string;
  published_at?: string;
}

function requireClient() {
  if (!supabase) throw new Error(supabaseConfigError ?? 'SafeBus is not configured.');
  return supabase;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Unexpected terms response. Please retry.');
  return value as Record<string, unknown>;
}

function errorMessage(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202' || error.code === '42883')
    return 'Terms setup is not yet available. Please contact SafeBus support.';
  return 'Could not verify the agreement. Check your connection and try again.';
}

export async function getMyParticipantAgreement(): Promise<ParticipantAgreementStatus> {
  const { data, error } = await requireClient().rpc('get_my_participant_agreement');
  if (error) throw new Error(errorMessage(error));
  const result = object(data);
  if (typeof result.required !== 'boolean' ||
      !['grandfathered','not_published','pending','accepted'].includes(String(result.status)))
    throw new Error('Invalid terms verification. Please retry.');
  if (!result.required) return { required: false, status: 'grandfathered' };
  if (result.status === 'not_published') return { required: true, status: 'not_published' };
  const terms = object(result.terms);
  const notice = object(result.notice);
  if (typeof terms.id !== 'string' || typeof terms.title !== 'string' ||
      typeof terms.version !== 'string' || typeof terms.sha256 !== 'string' ||
      typeof terms.body !== 'string' || !/^[a-f0-9]{64}$/.test(terms.sha256) ||
      typeof notice.url !== 'string' || !['/privacy#drivers','/privacy#guardians'].includes(notice.url) ||
      typeof notice.version !== 'string')
    throw new Error('Incomplete approved terms. Contact SafeBus.');
  return {
    required: true,
    status: result.status as 'pending' | 'accepted',
    terms: {
      id: terms.id, title: terms.title, version: terms.version,
      sha256: terms.sha256, body: terms.body,
    },
    notice: { url: notice.url, version: notice.version },
    accepted_at: typeof result.accepted_at === 'string' ? result.accepted_at : null,
  };
}

export async function acceptMyParticipantAgreement(input: {
  documentId: string;
  sha256: string;
  acceptTerms: boolean;
  acknowledgeNotice: boolean;
}): Promise<void> {
  if (!input.acceptTerms || !input.acknowledgeNotice)
    throw new Error('Both acknowledgments are required.');
  const { data, error } = await requireClient().rpc('accept_my_participant_agreement', {
    p_document_id: input.documentId,
    p_terms_sha256: input.sha256,
    p_terms_accepted: input.acceptTerms,
    p_notice_acknowledged: input.acknowledgeNotice,
  });
  if (error) throw new Error(errorMessage(error));
  const status = object(data).status;
  if (status !== 'accepted' && status !== 'not_required')
    throw new Error('The agreement was not confirmed. Please retry.');
}

export async function getPublishedParticipantTerms(): Promise<PublishedParticipantTerms> {
  const { data, error } = await requireClient().rpc('platform_get_participant_terms');
  if (error) throw new Error(errorMessage(error));
  const result = object(data);
  if (result.status === 'not_published') return { status: 'not_published' };
  if (result.status !== 'published' || typeof result.document_id !== 'string' ||
      typeof result.version !== 'string' || typeof result.sha256 !== 'string')
    throw new Error('Unexpected publication status.');
  return {
    status: 'published', document_id: result.document_id, version: result.version,
    sha256: result.sha256,
    published_at: typeof result.published_at === 'string' ? result.published_at : undefined,
  };
}

export async function publishParticipantTerms(documentId: string) {
  const { data, error } = await requireClient().rpc('platform_publish_participant_terms', {
    p_document_id: documentId,
  });
  if (error) throw new Error(errorMessage(error));
  if (object(data).published !== true) throw new Error('Terms publication was not confirmed.');
}

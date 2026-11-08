import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc },
  supabaseConfigError: null,
}));

import {
  acceptMyParticipantAgreement,
  getMyParticipantAgreement,
  getPublishedParticipantTerms,
  publishParticipantTerms,
} from './participantAgreementService';

const hash = 'a'.repeat(64);
beforeEach(() => rpc.mockReset());

describe('participant agreement service', () => {
  it('keeps existing participants grandfathered without inventing acceptance', async () => {
    rpc.mockResolvedValue({ data: { required: false, status: 'grandfathered' }, error: null });
    const result = await getMyParticipantAgreement();
    expect(result).toEqual({ required: false, status: 'grandfathered' });
  });

  it('returns a required, unpublished state without allowing acceptance', async () => {
    rpc.mockResolvedValue({ data: { required: true, status: 'not_published' }, error: null });
    expect(await getMyParticipantAgreement()).toEqual({
      required: true, status: 'not_published',
    });
  });

  it('loads only a valid exact-version agreement and known privacy route', async () => {
    rpc.mockResolvedValue({ data: {
      required: true, status: 'pending',
      terms: { id: 'document-1', title: 'SafeBus Terms of Use', version: 'v1', sha256: hash, body: 'Full Terms' },
      notice: { url: '/privacy#drivers', version: 'driver-v1' },
    }, error: null });
    const result = await getMyParticipantAgreement();
    expect(result.terms?.sha256).toBe(hash);
    expect(result.notice?.url).toBe('/privacy#drivers');
  });

  it('fails closed when a notice URL is untrusted', async () => {
    rpc.mockResolvedValue({ data: {
      required: true, status: 'pending',
      terms: { id: 'document-1', title: 'Terms', version: 'v1', sha256: hash, body: 'Terms' },
      notice: { url: 'https://untrusted.invalid', version: 'v1' },
    }, error: null });
    await expect(getMyParticipantAgreement()).rejects.toThrow('Incomplete approved terms');
  });

  it('does not submit a partial or implied acceptance', async () => {
    await expect(acceptMyParticipantAgreement({
      documentId: 'document-1', sha256: hash,
      acceptTerms: true, acknowledgeNotice: false,
    })).rejects.toThrow('Both acknowledgments');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('confirms server-recorded acceptance without trusting local storage', async () => {
    rpc.mockResolvedValue({ data: { status: 'accepted' }, error: null });
    await acceptMyParticipantAgreement({
      documentId: 'document-1', sha256: hash,
      acceptTerms: true, acknowledgeNotice: true,
    });
    expect(rpc).toHaveBeenCalledWith('accept_my_participant_agreement', {
      p_document_id: 'document-1', p_terms_sha256: hash,
      p_terms_accepted: true, p_notice_acknowledged: true,
    });
  });

  it('rejects missing RPCs instead of fabricating a legal receipt', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    await expect(getMyParticipantAgreement()).rejects.toThrow('not yet available');
  });

  it('never assumes that participant terms have been published', async () => {
    rpc.mockResolvedValue({ data: { status: 'not_published' }, error: null });
    expect(await getPublishedParticipantTerms()).toEqual({ status: 'not_published' });
  });

  it('requires explicit server acknowledgment when publishing terms', async () => {
    rpc.mockResolvedValue({ data: { published: true }, error: null });
    await publishParticipantTerms('document-1');
    expect(rpc).toHaveBeenCalledWith('platform_publish_participant_terms', {
      p_document_id: 'document-1',
    });
  });
});

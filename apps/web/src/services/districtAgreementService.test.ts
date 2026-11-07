import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  supabase: { rpc },
  supabaseConfigError: null,
}));

import {
  getDistrictAgreement, getPlatformAgreement,
  signDistrictAgreement, requestOfficer, requestExternalProcess,
} from './districtAgreementService';

describe('district legal agreement client', () => {
  beforeEach(() => rpc.mockReset());

  it('reports not issued when the staged migration is not installed (never an executed contract)', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    await expect(getDistrictAgreement()).resolves.toMatchObject({
      status: 'not_issued', documents: [],
    });
    await expect(getPlatformAgreement('tenant-1')).resolves.toMatchObject({
      status: 'not_issued',
    });
  });

  it('surfaces network/database failures without a false not-issued or success state', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'denied' } });
    await expect(getDistrictAgreement()).rejects.toThrow('Unable to securely load');
  });

  it('retrieves exact document text and hashes, never creating a local signed status', async () => {
    const doc = { id: '1', kind: 'msa', title: 'MSA', body: 'Full agreement',
      sha256: 'a'.repeat(64), version: '1.0' };
    rpc.mockResolvedValue({
      data: { status: 'issued', tenant_name: 'Authority A',
        bundle_sha256: 'b'.repeat(64), documents: [doc] },
      error: null,
    });
    const agreement = await getDistrictAgreement();
    expect(agreement.status).toBe('issued');
    expect(agreement.documents).toEqual([doc]);
  });

  it('passes both affirmative signing intents and the immutable bundle hash to server', async () => {
    rpc.mockResolvedValue({ data: { status: 'pending_provider_signature' }, error: null });
    await signDistrictAgreement({
      id: 'package-1', digest: 'c'.repeat(64), name: 'Officer A',
      title: 'Director', electronicConsent: true, signatureIntent: true,
    });
    expect(rpc).toHaveBeenCalledWith('customer_sign_district_agreement', expect.objectContaining({
      p_package_id: 'package-1',
      p_bundle_sha256: 'c'.repeat(64),
      p_electronic_consent: true,
      p_signature_intent: true,
    }));
  });

  it('records an officer request without claiming the invitation was delivered', async () => {
    rpc.mockResolvedValue({ data: { status: 'pending_authority', invitation_sent: false }, error: null });
    const result = await requestOfficer('package-1', 'd'.repeat(64), 'Officer', 'officer@example.test');
    expect(result.invitation_sent).toBe(false);
    expect(rpc).toHaveBeenCalledWith('request_district_agreement_signer', expect.objectContaining({
      p_external_process: false,
    }));
    await requestExternalProcess('package-1', 'd'.repeat(64));
    expect(rpc).toHaveBeenLastCalledWith('request_district_agreement_signer', expect.objectContaining({
      p_external_process: true,
    }));
  });
});

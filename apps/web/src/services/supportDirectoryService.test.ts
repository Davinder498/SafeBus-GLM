import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }));
vi.mock('@/lib/supabase', () => ({ supabase: { rpc }, supabaseConfigError: null }));

import {
  updatePlatformSupportContact,
  updateTenantSupportContact,
  type SupportContactInput,
} from './supportDirectoryService';

const input: SupportContactInput = {
  displayName: 'Platform Admin',
  email: 'platform@example.test',
  phone: null,
  websiteUrl: null,
  supportHours: 'Monday-Friday, 8:00 AM-5:00 PM MT',
  instructions: 'Contact the support team.',
};

describe('support directory writes', () => {
  beforeEach(() => rpc.mockReset());

  it('uses the address-aware writer and keeps omission compatible with older callers', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await updateTenantSupportContact({ ...input, address: '  123 School Road\nCalgary AB  ' });
    expect(rpc).toHaveBeenLastCalledWith(
      'update_tenant_support_contact_v2',
      expect.objectContaining({ p_address: '123 School Road\nCalgary AB' }),
    );
    await updateTenantSupportContact({ ...input, address: null });
    expect(rpc).toHaveBeenLastCalledWith(
      'update_tenant_support_contact_v2',
      expect.objectContaining({ p_address: null }),
    );
    await updateTenantSupportContact(input);
    expect(rpc).toHaveBeenLastCalledWith(
      'update_tenant_support_contact',
      expect.not.objectContaining({ p_address: expect.anything() }),
    );
  });

  it.each([updatePlatformSupportContact, updateTenantSupportContact])(
    'explains how to recover from an expired recent-authentication window',
    async (updateContact) => {
      rpc.mockResolvedValue({
        data: null,
        error: {
          code: '55006',
          message:
            'Recent authentication is required for this sensitive action. Please sign in again.',
        },
      });

      await expect(updateContact(input)).rejects.toThrow(
        'For your security, sign out and sign back in, then save again within 15 minutes.',
      );
      expect(rpc).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps unexpected database details out of the platform error message', async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: 'XX000', message: 'internal database implementation details' },
    });

    await expect(updatePlatformSupportContact(input)).rejects.toThrow(
      'Platform support details were not saved.',
    );
  });
});

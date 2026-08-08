import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

const { createClient } = await import('@supabase/supabase-js');
const { runInvitationExpiry } = await import(
  '../../netlify/functions/safebus-invitation-expiry-scheduled.mjs'
);

describe('scheduled invitation expiry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SECRET_KEY = 'server-secret';
  });

  it('runs the service-only atomic expiry operation', async () => {
    const rpc = vi.fn(async () => ({ data: { expired: 7 }, error: null }));
    createClient.mockReturnValue({ rpc });

    const response = await runInvitationExpiry();

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body)).toEqual({ expired: 7 });
    expect(rpc).toHaveBeenCalledWith('expire_stale_invitations');
  });

  it('does not run without server-only credentials', async () => {
    delete process.env.SUPABASE_SECRET_KEY;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;

    const response = await runInvitationExpiry();

    expect(response.statusCode).toBe(503);
    expect(createClient).not.toHaveBeenCalled();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

const stripeConstructor = vi.hoisted(() => vi.fn());
vi.mock('stripe', () => ({ default: stripeConstructor }));

import { createStripeClient } from '../../netlify/functions/billing-shared.mjs';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe('Stripe billing API stability across SDK updates', () => {
  it('preserves the previous API version instead of inheriting the SDK default', () => {
    vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_fixture_only_no_network');
    createStripeClient();
    expect(stripeConstructor).toHaveBeenCalledOnce();
    expect(stripeConstructor).toHaveBeenCalledWith(
      'sk_test_fixture_only_no_network',
      expect.objectContaining({
        apiVersion: '2026-10-28.endive',
        maxNetworkRetries: 2,
        timeout: 15000,
        appInfo: { name: 'SafeBus', version: '1.0.0' },
      }),
    );
  });
});

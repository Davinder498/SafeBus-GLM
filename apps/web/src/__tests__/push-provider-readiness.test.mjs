import { expect, it, vi } from 'vitest';
import { validatePushProvider } from '../../../../supabase/functions/_shared/push-readiness-core.mjs';

it('validates a registered device without mutating delivery queues or returning tokens', async () => {
  const validate = vi.fn(async () => 'validated_without_delivery');
  const result = await validatePushProvider({
    findDevice: async () => 'synthetic-token',
    validate,
  });
  expect(validate).toHaveBeenCalledOnce();
  expect(validate).toHaveBeenCalledWith(
    expect.objectContaining({ fcm_token: 'synthetic-token', severity: 'info' }),
  );
  expect(result).toEqual({
    firebase: 'validated',
    registeredDevice: true,
    notificationSent: false,
  });
  expect(JSON.stringify(result)).not.toContain('synthetic-token');
});
it('fails readiness without a registered device and propagates provider rejection', async () => {
  const validate = vi.fn();
  await expect(validatePushProvider({ findDevice: async () => null, validate })).rejects.toThrow(
    'no_registered_device',
  );
  expect(validate).not.toHaveBeenCalled();
  await expect(
    validatePushProvider({
      findDevice: async () => 'synthetic-token',
      validate: async () => {
        throw new Error('rejected');
      },
    }),
  ).rejects.toThrow('rejected');
});

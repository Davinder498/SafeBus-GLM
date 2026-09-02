import { describe, expect, it } from 'vitest';
import { parseNativePasswordRecoveryLink } from './authDeepLinkParsing';

describe('native password-recovery links', () => {
  it('accepts only the SafeBus Android recovery destination', () => {
    expect(
      parseNativePasswordRecoveryLink(
        'com.safebusalberta.app://auth/update-password#access_token=access&refresh_token=refresh&type=recovery',
      ),
    ).toMatchObject({
      destinationPath: '/update-password',
      accessToken: 'access',
      refreshToken: 'refresh',
    });

    expect(
      parseNativePasswordRecoveryLink(
        'com.safebusalberta.app://notifications/update-password#access_token=access',
      ),
    ).toBeNull();
    expect(parseNativePasswordRecoveryLink('https://evil.example/update-password')).toBeNull();
    expect(
      parseNativePasswordRecoveryLink(
        'com.safebusalberta.app://auth/update-password#access_token=access&type=signup',
      ),
    ).toBeNull();
  });

  it('supports PKCE and token-hash recovery callbacks without exposing them in the route', () => {
    expect(
      parseNativePasswordRecoveryLink(
        'com.safebusalberta.app://auth/update-password?code=pkce-code',
      )?.code,
    ).toBe('pkce-code');
    expect(
      parseNativePasswordRecoveryLink(
        'com.safebusalberta.app://auth/update-password?token_hash=hashed&type=recovery',
      )?.tokenHash,
    ).toBe('hashed');
  });
});

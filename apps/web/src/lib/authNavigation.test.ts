import { describe, expect, it } from 'vitest';
import {
  ANDROID_PASSWORD_RESET_REDIRECT,
  getPasswordResetRedirect,
  navigateToPasswordUpdate,
  normalizeAuthEmail,
} from './authNavigation';

describe('authentication navigation', () => {
  it('normalizes email without changing the password input', () => {
    expect(normalizeAuthEmail('  Driver@Example.CA ')).toBe('driver@example.ca');
  });

  it('keeps web password recovery on the web application', () => {
    expect(getPasswordResetRedirect('web', 'https://safebus.example')).toBe(
      'https://safebus.example/update-password',
    );
  });

  it('returns the registered Android recovery deep link for the native surface', () => {
    expect(getPasswordResetRedirect('native-mobile', 'https://localhost')).toBe(
      ANDROID_PASSWORD_RESET_REDIRECT,
    );
  });

  it('moves a recovered session to the password form without retaining tokens', () => {
    window.history.replaceState(
      {},
      '',
      '/#access_token=sensitive&refresh_token=sensitive&type=recovery',
    );

    let popStateEvents = 0;
    window.addEventListener(
      'popstate',
      () => {
        popStateEvents += 1;
      },
      { once: true },
    );

    navigateToPasswordUpdate();

    expect(window.location.pathname).toBe('/update-password');
    expect(window.location.search).toBe('');
    expect(window.location.hash).toBe('');
    expect(popStateEvents).toBe(1);
  });
});

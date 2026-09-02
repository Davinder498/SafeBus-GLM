import { describe, expect, it } from 'vitest';
import {
  ANDROID_PASSWORD_RESET_REDIRECT,
  getPasswordResetRedirect,
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
});

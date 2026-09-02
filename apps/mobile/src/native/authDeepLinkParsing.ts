import { ANDROID_PASSWORD_RESET_REDIRECT } from '@/lib/authNavigation';

export interface NativePasswordRecoveryLink {
  destinationPath: '/update-password';
  accessToken: string | null;
  refreshToken: string | null;
  code: string | null;
  tokenHash: string | null;
  recoveryType: string | null;
  errorDescription: string | null;
}

const expected = new URL(ANDROID_PASSWORD_RESET_REDIRECT);

export function parseNativePasswordRecoveryLink(
  value: string,
): NativePasswordRecoveryLink | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (
    url.protocol !== expected.protocol ||
    url.hostname !== expected.hostname ||
    url.pathname !== expected.pathname
  ) {
    return null;
  }

  const fragment = new URLSearchParams(url.hash.startsWith('#') ? url.hash.slice(1) : url.hash);
  const parameter = (name: string) => url.searchParams.get(name) ?? fragment.get(name);
  const recoveryType = parameter('type');
  if (recoveryType && recoveryType !== 'recovery') return null;

  return {
    destinationPath: '/update-password',
    accessToken: parameter('access_token'),
    refreshToken: parameter('refresh_token'),
    code: parameter('code'),
    tokenHash: parameter('token_hash'),
    recoveryType,
    errorDescription: parameter('error_description'),
  };
}

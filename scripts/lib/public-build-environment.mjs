const SYSTEM_KEYS = new Set([
  'PATH',
  'Path',
  'PATHEXT',
  'HOME',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'SystemRoot',
  'SYSTEMROOT',
  'WINDIR',
  'COMSPEC',
  'TEMP',
  'TMP',
  'TMPDIR',
  'CI',
  'PNPM_HOME',
  'npm_execpath',
  'npm_config_user_agent',
  'INIT_CWD',
  'NODE_ENV',
  'NODE_EXTRA_CA_CERTS',
  'GITHUB_ACTIONS',
  'SAFEBUS_RELEASE_SHA',
  'SAFEBUS_DEPLOY_ENV',
]);
export function publicBuildEnvironment(env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        SYSTEM_KEYS.has(key) || key === 'VITE_SUPABASE_URL' || key === 'VITE_SUPABASE_ANON_KEY',
    ),
  );
}
export async function verifyPublicFrontendConfiguration(env, request = fetch) {
  const expected = 'https://ckrkfylsyihwouvesypm.supabase.co';
  if (env.VITE_SUPABASE_URL?.replace(/\/$/, '') !== expected) throw Error('PUBLIC_BUILD_TARGET');
  const key = env.VITE_SUPABASE_ANON_KEY ?? '';
  let publicKey = key.startsWith('sb_publishable_') && key.length > 24;
  if (!publicKey) {
    try {
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString());
      publicKey =
        key.split('.').length === 3 &&
        claims.role === 'anon' &&
        (!claims.ref || claims.ref === 'ckrkfylsyihwouvesypm');
    } catch {
      publicKey = false;
    }
  }
  if (!publicKey) throw Error('PUBLIC_BUILD_KEY_NOT_PUBLIC');
  let response;
  try {
    response = await request(expected + '/auth/v1/settings', {
      method: 'GET',
      redirect: 'error',
      headers: { apikey: key },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw Error('PUBLIC_BUILD_KEY_UNVERIFIED');
  }
  if (!response.ok) throw Error('PUBLIC_BUILD_KEY_UNVERIFIED');
  return { projectVerified: true, publicKeyAccepted: true, authenticationJourneyVerified: false };
}

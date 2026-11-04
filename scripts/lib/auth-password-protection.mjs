const PROJECT_ID = 'ckrkfylsyihwouvesypm';
export function authPasswordProtectionApi({ projectId, token, fetchImpl = fetch }) {
  if (projectId !== PROJECT_ID || typeof token !== 'string' || !token.trim())
    throw new Error('AUTH_SECURITY_TARGET_OR_ACCESS');
  const url = `https://api.supabase.com/v1/projects/${PROJECT_ID}/config/auth`;
  const request = async (method) => {
    let response;
    try {
      response = await fetchImpl(url, {
        method,
        redirect: 'error',
        signal: AbortSignal.timeout(15_000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(method === 'PATCH' ? { body: JSON.stringify({ password_hibp_enabled: true }) } : {}),
      });
    } catch {
      throw new Error('AUTH_SECURITY_NETWORK');
    }
    if (!response.ok) throw new Error(`AUTH_SECURITY_HTTP_${response.status}`);
    return response;
  };
  const read = async () => {
    const response = await request('GET');
    let config;
    try {
      config = await response.json();
    } catch {
      throw new Error('AUTH_SECURITY_RESPONSE');
    }
    // Discard the complete response: it may contain SMTP and provider secrets.
    const enabled = config?.password_hibp_enabled;
    if (typeof enabled !== 'boolean') throw new Error('AUTH_SECURITY_FLAG_MISSING');
    return enabled;
  };
  const enable = async (expected, onAttempt = () => {}) => {
    if (typeof expected !== 'boolean') throw new Error('AUTH_SECURITY_BASELINE');
    const before = await read();
    if (before !== expected) throw new Error('AUTH_SECURITY_BASELINE_CHANGED');
    if (!before) {
      onAttempt();
      await request('PATCH');
    }
    const after = await read();
    if (!after) throw new Error('AUTH_SECURITY_VERIFICATION');
    return { before, after, changed: !before };
  };
  return { read, enable };
}

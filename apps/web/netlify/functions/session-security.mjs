// getUser verifies the JWT/user, but a signed JWT can outlive its Auth session.
// Check the database session before granting access to service-role operations.
export async function verifyActiveCallerSession(userClient) {
  try {
    const { data, error } = await userClient.rpc('is_current_user_session_active');
    if (error) {
      return { statusCode: 503, message: 'Unable to verify your session. Try again shortly.' };
    }
    if (data !== true) {
      return { statusCode: 401, message: 'Your session is no longer active. Sign in again.' };
    }
    return null;
  } catch {
    return { statusCode: 503, message: 'Unable to verify your session. Try again shortly.' };
  }
}

// Call after the active-session and administrator MFA checks. getClaims verifies
// the supplied access token; never use account-wide last_sign_in_at or token iat
// (refreshing a token is not signing in again).
export async function verifyRecentCallerAuthentication(
  userClient,
  token,
  userId,
  now = Date.now(),
) {
  let result;
  try {
    result = await userClient.auth.getClaims(token);
  } catch {
    return { statusCode: 503, message: 'Unable to verify recent sign-in. Try again shortly.' };
  }
  if (!result || result.error)
    return { statusCode: 503, message: 'Unable to verify recent sign-in. Try again shortly.' };
  const claims = result.data?.claims;
  const signInMethods = new Set([
    'password',
    'oauth',
    'otp',
    'sso/saml',
    'magiclink',
    'recovery',
    'invite',
    'email/signup',
  ]);
  const recent =
    claims?.sub === userId &&
    claims?.role === 'authenticated' &&
    typeof claims?.session_id === 'string' &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(claims.session_id) &&
    Number.isFinite(now) &&
    Array.isArray(claims.amr) &&
    claims.amr.some(
      (entry) =>
        signInMethods.has(entry?.method) &&
        Number.isSafeInteger(entry.timestamp) &&
        entry.timestamp > 0 &&
        entry.timestamp * 1000 <= now + 60_000 &&
        entry.timestamp * 1000 >= now - 15 * 60_000,
    );
  return recent
    ? null
    : { statusCode: 403, message: 'Sign in again before performing this sensitive action.' };
}

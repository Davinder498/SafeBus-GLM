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

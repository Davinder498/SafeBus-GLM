/**
 * Phase 6 test helpers — builds a structurally valid fake JWT for smoke tests.
 *
 * supabase-js parses the access_token locally to check expiry before making
 * network calls. A plain string (no dots) is rejected, causing getSession()
 * to return null. This helper returns a 3-part JWT with a future expiry so
 * the local session is considered valid; the actual claims are irrelevant
 * because the mock intercepts every Supabase request.
 */

const HEADER = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9';
const SIGNATURE = 'smoke-test-signature';

export function buildFakeJwt(): string {
  // Payload with a far-future exp so supabase-js treats the session as valid.
  const payload = {
    sub: '00000000-0000-0000-0000-000000000000',
    role: 'authenticated',
    aal: 'aal2',
    amr: [{ method: 'totp', timestamp: 4102440000 }],
    exp: 4102444800,
  };
  // base64url encode without padding (browser context via addInitScript uses
  // the node test process here, but we only need a 3-part dotted string).
  const encodedPayload = Buffer.from(JSON.stringify(payload))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return [HEADER, encodedPayload, SIGNATURE].join('.');
}

export const FAKE_ACCESS_TOKEN = buildFakeJwt();

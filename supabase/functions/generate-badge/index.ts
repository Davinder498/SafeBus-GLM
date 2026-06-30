// SafeBus Alberta — generate-badge Edge Function
// Phase 7 (QR Scan)
//
// Generates a cryptographically random QR badge token for a student.
// Returns the plaintext token ONCE (for QR printing). Stores only the hash.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { crypto as stdCrypto } from 'https://deno.land/std@0.224.0/crypto/mod.ts';

interface GenerateBadgeRequest {
  studentId: string;
  replaceExisting?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    {
      global: { headers: { Authorization: req.headers.get('Authorization')! } },
    },
  );

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, tenant_id')
    .eq('auth_user_id', user.id)
    .single();

  if (!profile || !['tenant_admin', 'school_admin', 'transportation_admin', 'platform_super_admin'].includes(profile.role)) {
    return new Response('Forbidden', { status: 403 });
  }

  let body: GenerateBadgeRequest;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Verify student belongs to tenant
  const { data: student } = await supabase
    .from('students')
    .select('id, tenant_id')
    .eq('id', body.studentId)
    .eq('tenant_id', profile.tenant_id)
    .single();

  if (!student) {
    return new Response('Student not found', { status: 404 });
  }

  // Replace existing badge if requested
  if (body.replaceExisting) {
    await supabase
      .from('student_badges')
      .update({ status: 'replaced', revoked_at: new Date().toISOString() })
      .eq('student_id', body.studentId)
      .eq('status', 'active');
  }

  // Generate 32-byte random token
  const tokenBytes = new Uint8Array(32);
  stdCrypto.getRandomValues(tokenBytes);
  const qrToken = base64url(tokenBytes);

  // Hash the token for storage
  const tokenHash = await hashToken(qrToken);

  // Insert badge
  const { data: badge, error } = await supabase
    .from('student_badges')
    .insert({
      student_id: body.studentId,
      token_hash: tokenHash,
      status: 'active',
    })
    .select('id, status')
    .single();

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Return plaintext token ONCE
  return new Response(
    JSON.stringify({
      badgeId: badge.id,
      qrToken,
      status: badge.status,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});

async function hashToken(token: string): Promise<string> {
  const hashBuffer = await stdCrypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function base64url(bytes: Uint8Array): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b1 = bytes[i]!;
    const b2 = bytes[i + 1] ?? 0;
    const b3 = bytes[i + 2] ?? 0;
    result += chars[b1 >> 2];
    result += chars[((b1 & 0x03) << 4) | (b2 >> 4)];
    result += chars[((b2 & 0x0f) << 2) | (b3 >> 6)];
    result += chars[b3 & 0x3f];
  }
  return result;
}

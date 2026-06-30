// SafeBus Alberta — dispatch-notification Edge Function
// Phase 6 (Parent + Notifications)
//
// Writes notifications to the notifications table and dispatches
// via configured channels (in-app, push, email).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface DispatchRequest {
  profileId: string;
  studentId: string | null;
  title: string;
  message: string;
  type: string;
  channels: ('in_app' | 'push' | 'email')[];
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  let body: DispatchRequest;
  try {
    body = await req.json();
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Insert in-app notification
  const { data: notification, error } = await supabase
    .from('notifications')
    .insert({
      profile_id: body.profileId,
      student_id: body.studentId,
      title: body.title,
      message: body.message,
      type: body.type,
      status: 'unread',
    })
    .select()
    .single();

  if (error) {
    return new Response(JSON.stringify({ accepted: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const failures: { channel: string; reason: string }[] = [];

  // Push + email dispatch (Phase 6 implementation)
  // TODO: implement web push (VAPID) + email (Resend/SES)

  return new Response(
    JSON.stringify({ accepted: true, notificationId: notification.id, failures }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
});

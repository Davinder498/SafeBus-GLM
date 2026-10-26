// Provider validation uses FCM validate_only. It never claims an outbox row,
// changes recipient settings, or delivers a notification.
export async function validatePushProvider({ findDevice, validate }) {
  const token = await findDevice();
  if (typeof token !== 'string' || !token) throw new Error('no_registered_device');
  await validate({
    fcm_token: token,
    notification_id: '00000000-0000-4000-8000-000000000000',
    event_type: 'trip_started',
    category: 'trip_status',
    severity: 'info',
    title: 'SafeBus update',
    body: 'Open SafeBus to view this update.',
    android_channel: 'trip_updates',
    collapse_key: 'safebus-provider-validation',
  });
  return { firebase: 'validated', registeredDevice: true, notificationSent: false };
}

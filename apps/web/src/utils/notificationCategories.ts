import type { NotificationCategory } from '@safebus/types';

export const notificationCategoryChoices: Record<
  string,
  Array<{ value: NotificationCategory; label: string }>
> = {
  guardian: [
    { value: 'pickup_dropoff', label: 'Pickup & drop-off' },
    { value: 'trip_status', label: 'Trip updates' },
    { value: 'operations', label: 'Operational alerts' },
  ],
  driver: [
    { value: 'assignments', label: 'Assignment alerts' },
    { value: 'trip_status', label: 'Trip updates' },
    { value: 'operations', label: 'Operational alerts' },
  ],
  admin: [
    { value: 'trip_status', label: 'Trip updates' },
    { value: 'operations', label: 'Operational alerts' },
    { value: 'delivery_health', label: 'Delivery health' },
  ],
  platform_super_admin: [{ value: 'platform', label: 'Platform alerts' }],
};

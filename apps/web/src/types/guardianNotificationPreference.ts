export interface GuardianNotificationPreference {
  studentId: string;
  studentName: string;
  emailEnabled: boolean;
  notifyPickup: boolean;
  notifyDropoff: boolean;
  pushPickupDropoff: boolean;
  pushTripStatus: boolean;
  pushServiceChanges: boolean;
  preferencesSetAt: string | null;
  accessExpiresAt: string | null;
}

export interface GuardianNotificationPreferenceInput {
  studentId: string;
  emailEnabled: boolean;
  notifyPickup: boolean;
  notifyDropoff: boolean;
  pushPickupDropoff: boolean;
  pushTripStatus: boolean;
  pushServiceChanges: boolean;
}

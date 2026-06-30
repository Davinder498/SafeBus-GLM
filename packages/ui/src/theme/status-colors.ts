/**
 * SafeBus Alberta — Status color mapping.
 *
 * Maps status enums (from @safebus/types) to color tokens for consistent
 * visual representation across all apps.
 */

import type {
  AlertSeverity,
  GpsStatus,
  PickupStatus,
  TripStatus,
} from '@safebus/types';
import { colors } from './colors.ts';

export type StatusColor = {
  text: string;
  bg: string;
  border: string;
};

export const tripStatusColors: Record<TripStatus, StatusColor> = {
  scheduled: { text: colors.navy[700], bg: colors.navy[100], border: colors.navy[200] },
  active: { text: colors.green[700], bg: colors.green[50], border: colors.green[100] },
  delayed: { text: colors.amber[700], bg: colors.amber[100], border: colors.amber[200] },
  completed: { text: colors.gray[600], bg: colors.gray[100], border: colors.gray[200] },
  cancelled: { text: colors.gray[600], bg: colors.gray[100], border: colors.gray[200] },
  gps_stale: { text: colors.amber[700], bg: colors.amber[100], border: colors.amber[200] },
  gps_lost: { text: colors.red[600], bg: colors.red[50], border: colors.red[100] },
};

export const pickupStatusColors: Record<PickupStatus, StatusColor> = {
  not_picked_up: { text: colors.gray[600], bg: colors.gray[100], border: colors.gray[200] },
  picked_up: { text: colors.green[700], bg: colors.green[50], border: colors.green[100] },
  boarded: { text: colors.green[700], bg: colors.green[50], border: colors.green[100] },
  dropped_off: { text: colors.green[700], bg: colors.green[50], border: colors.green[100] },
  absent: { text: colors.gray[600], bg: colors.gray[100], border: colors.gray[200] },
  manual_override: { text: colors.amber[700], bg: colors.amber[100], border: colors.amber[200] },
};

export const gpsStatusColors: Record<GpsStatus, StatusColor> = {
  live: { text: colors.green[700], bg: colors.green[50], border: colors.green[100] },
  stale: { text: colors.amber[700], bg: colors.amber[100], border: colors.amber[200] },
  lost: { text: colors.red[600], bg: colors.red[50], border: colors.red[100] },
  permission_needed: { text: colors.red[600], bg: colors.red[50], border: colors.red[100] },
  syncing: { text: colors.navy[700], bg: colors.navy[100], border: colors.navy[200] },
  offline: { text: colors.gray[600], bg: colors.gray[100], border: colors.gray[200] },
};

export const alertSeverityColors: Record<AlertSeverity, StatusColor> = {
  urgent: { text: colors.red[600], bg: colors.red[50], border: colors.red[100] },
  warning: { text: colors.amber[700], bg: colors.amber[100], border: colors.amber[200] },
  info: { text: colors.navy[700], bg: colors.navy[100], border: colors.navy[200] },
};

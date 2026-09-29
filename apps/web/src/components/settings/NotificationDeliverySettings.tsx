import type { ReactNode } from 'react';
import { Bell, ExternalLink, Mail } from 'lucide-react';
import type { PushPermissionState } from '@safebus/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { GuardianIconTile } from '@/components/ui/GuardianIconTile';

export interface NotificationAlertChoice {
  key?: string;
  description: string;
  emailChecked: boolean;
  icon: ReactNode;
  label: string;
  onEmailChange: (checked: boolean) => void;
  onPushChange: (checked: boolean) => void;
  pushChecked: boolean;
}

interface NotificationDeliverySettingsProps {
  alerts: NotificationAlertChoice[];
  emailEnabled: boolean;
  message: string | null;
  nativePushAvailable: boolean;
  onEmailEnabledChange: (checked: boolean) => void;
  onOpenSystemSettings?: () => void;
  onPushEnabledChange: (checked: boolean) => void;
  pendingSaves: number;
  permissionState: PushPermissionState | null;
  pushEnabled: boolean;
}

function ChannelCard({
  checked,
  description,
  icon,
  label,
  onChange,
}: {
  checked: boolean;
  description: string;
  icon: ReactNode;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Card className="p-0" data-card-type={`notification-${label.toLowerCase()}`}>
      <label
        className="grid min-h-24 cursor-pointer grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-4"
        data-ui="notification-channel-control"
      >
        <GuardianIconTile>{icon}</GuardianIconTile>
        <span className="min-w-0">
          <b className="block text-navy-900">{label}</b>
          <span className="mt-1 block text-sm leading-5 text-slate-600">{description}</span>
        </span>
        <input
          type="checkbox"
          role="switch"
          checked={checked}
          aria-label={label}
          onChange={(event) => onChange(event.target.checked)}
        />
      </label>
    </Card>
  );
}

function AlertRow({
  description,
  emailChecked,
  icon,
  label,
  onEmailChange,
  onPushChange,
  pushChecked,
}: NotificationAlertChoice) {
  return (
    <div
      className="grid min-h-20 grid-cols-[auto_minmax(0,1fr)_3.5rem_3.5rem] items-center gap-2 px-4 py-3"
      data-ui="notification-alert-row"
    >
      <GuardianIconTile>{icon}</GuardianIconTile>
      <span className="min-w-0 pr-1">
        <b className="block text-sm text-navy-900">{label}</b>
        <span className="mt-0.5 block text-xs leading-4 text-slate-600">{description}</span>
      </span>
      <label
        className="grid min-h-12 min-w-12 cursor-pointer place-items-center"
        data-ui="notification-alert-channel-control"
      >
        <span className="sr-only">{label} push</span>
        <input
          type="checkbox"
          checked={pushChecked}
          aria-label={`${label} push`}
          onChange={(event) => onPushChange(event.target.checked)}
        />
      </label>
      <label
        className="grid min-h-12 min-w-12 cursor-pointer place-items-center"
        data-ui="notification-alert-channel-control"
      >
        <span className="sr-only">{label} email</span>
        <input
          type="checkbox"
          checked={emailChecked}
          aria-label={`${label} email`}
          onChange={(event) => onEmailChange(event.target.checked)}
        />
      </label>
    </div>
  );
}

export function NotificationDeliverySettings({
  alerts,
  emailEnabled,
  message,
  nativePushAvailable,
  onEmailEnabledChange,
  onOpenSystemSettings,
  onPushEnabledChange,
  pendingSaves,
  permissionState,
  pushEnabled,
}: NotificationDeliverySettingsProps) {
  return (
    <div data-ui="notification-settings-page">
      <div className="grid gap-3 sm:grid-cols-2" data-ui="notification-delivery-cards">
        <ChannelCard
          label="Push notifications"
          description="Alerts on your Android devices."
          checked={pushEnabled}
          icon={<Bell className="h-5 w-5" aria-hidden />}
          onChange={onPushEnabledChange}
        />
        <ChannelCard
          label="Email notifications"
          description="Updates sent to your account email."
          checked={emailEnabled}
          icon={<Mail className="h-5 w-5" aria-hidden />}
          onChange={onEmailEnabledChange}
        />
      </div>

      <Card className="mt-4 overflow-hidden p-0" data-card-type="notification-alert-matrix">
        <div className="grid grid-cols-[minmax(0,1fr)_3.5rem_3.5rem] items-end border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="font-bold text-navy-900">Alert types</h2>
            <p className="mt-0.5 text-xs text-slate-600">
              Choose each delivery channel independently.
            </p>
          </div>
          <span className="text-center text-xs font-semibold text-slate-600">Push</span>
          <span className="text-center text-xs font-semibold text-slate-600">Email</span>
        </div>
        <div className="divide-y divide-slate-200">
          {alerts.map(({ key, ...alert }) => (
            <AlertRow key={key ?? alert.label} {...alert} />
          ))}
        </div>
      </Card>

      <div className="mt-3 min-h-12" aria-live="polite" aria-atomic="true">
        {pendingSaves > 0 || message ? (
          <p
            className="rounded-xl px-3 py-2 text-sm font-medium text-slate-700"
            data-ui="notification-settings-status"
            role="status"
          >
            {pendingSaves > 0 ? 'Saving…' : message}
          </p>
        ) : null}
        {nativePushAvailable &&
        (permissionState === 'denied' || permissionState === 'permanently_denied') ? (
          <Button
            type="button"
            variant="secondary"
            className="mt-2 w-full"
            rightIcon={<ExternalLink className="h-4 w-4" aria-hidden />}
            onClick={onOpenSystemSettings ?? (() => void window.SafeBusNativePush?.openSystemSettings())}
          >
            Open Android notification settings
          </Button>
        ) : null}
      </div>
    </div>
  );
}

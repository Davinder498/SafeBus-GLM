import type { ReactNode } from 'react';
import { Bell, ExternalLink, Mail, Smartphone } from 'lucide-react';
import type { PushPermissionState } from '@safebus/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { GuardianIconTile } from '@/components/ui/GuardianIconTile';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';

export interface NotificationAlertChoice {
  key?: string;
  description: string;
  emailChecked: boolean;
  icon: ReactNode;
  label: string;
  onEmailChange: (checked: boolean) => void;
  onPushChange: (checked: boolean) => void;
  pushChecked: boolean;
  inAppChecked?: boolean;
  onInAppChange?: (checked: boolean) => void;
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
  inAppEnabled?: boolean;
  onInAppEnabledChange?: (checked: boolean) => void;
}

type Channel = 'in-app' | 'email' | 'push';

function ChannelSection({
  channel,
  label,
  description,
  icon,
  enabled,
  onChange,
  alerts,
}: {
  channel: Channel;
  label: string;
  description: string;
  icon: ReactNode;
  enabled: boolean;
  onChange: (checked: boolean) => void;
  alerts: NotificationAlertChoice[];
}) {
  return (
    <Card className="overflow-hidden p-0" data-card-type={`notification-${channel}`}>
      <section aria-label={label}>
        <div
          className="flex items-center gap-3 border-b border-slate-200 px-4 py-3"
          data-ui="notification-channel-control"
        >
          <GuardianIconTile>{icon}</GuardianIconTile>
          <div className="min-w-0 flex-1">
            <h2 className="font-bold text-navy-900">{label}</h2>
            <p className="mt-1 text-sm leading-5 text-slate-600">{description}</p>
          </div>
          <ToggleSwitch label={label} checked={enabled} onChange={onChange} />
        </div>
        <h3 className="px-4 pt-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Event alert types
        </h3>
        <div className="divide-y divide-slate-100 px-4">
          {alerts.map((alert) => {
            const checked =
              channel === 'in-app'
                ? (alert.inAppChecked ?? true)
                : channel === 'email'
                  ? alert.emailChecked
                  : alert.pushChecked;
            const change =
              channel === 'in-app'
                ? alert.onInAppChange
                : channel === 'email'
                  ? alert.onEmailChange
                  : alert.onPushChange;
            return (
              <div
                key={alert.key ?? alert.label}
                className="flex items-center gap-3 py-2"
                data-ui="notification-alert-row"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy-900">{alert.label}</p>
                  <p className="mt-0.5 text-xs leading-4 text-slate-600">{alert.description}</p>
                </div>
                <ToggleSwitch
                  label={`${alert.label} ${channel}`}
                  checked={checked}
                  disabled={!enabled}
                  onChange={(value) => change?.(value)}
                />
              </div>
            );
          })}
        </div>
      </section>
    </Card>
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
  inAppEnabled,
  onInAppEnabledChange,
}: NotificationDeliverySettingsProps) {
  return (
    <div className="mt-6" data-ui="notification-delivery-settings">
      <div className="space-y-4" data-ui="notification-delivery-cards">
        {inAppEnabled !== undefined && onInAppEnabledChange ? (
          <ChannelSection
            channel="in-app"
            label="In-app notifications"
            description="Choose future inbox updates. Existing notifications remain available."
            icon={<Bell className="h-5 w-5" aria-hidden />}
            enabled={inAppEnabled}
            onChange={onInAppEnabledChange}
            alerts={alerts}
          />
        ) : null}
        <ChannelSection
          channel="email"
          label="Email notifications"
          description="Updates sent to your account email. Your event choices are saved when email is off."
          icon={<Mail className="h-5 w-5" aria-hidden />}
          enabled={emailEnabled}
          onChange={onEmailEnabledChange}
          alerts={alerts}
        />
        <ChannelSection
          channel="push"
          label="Push notifications"
          description="Phone alerts on your Android devices, independent of your inbox and email choices."
          icon={<Smartphone className="h-5 w-5" aria-hidden />}
          enabled={pushEnabled}
          onChange={onPushEnabledChange}
          alerts={alerts}
        />
      </div>
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
            onClick={
              onOpenSystemSettings ?? (() => void window.SafeBusNativePush?.openSystemSettings())
            }
          >
            Open Android notification settings
          </Button>
        ) : null}
      </div>
    </div>
  );
}

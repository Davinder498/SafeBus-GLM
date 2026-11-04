/** Release availability is deliberate: update only after store verification. */
export const mobileAppAvailability = {
  android: {
    url: 'https://play.google.com/store/apps/details?id=com.safebusalberta.app',
    label: 'Android testing on Google Play',
  },
  ios: { url: null, label: 'iOS app coming soon' },
} as const;

export function MobileAppLinks() {
  return (
    <div className="space-y-2 text-sm" data-ui="mobile-app-links">
      <a
        href={mobileAppAvailability.android.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-11 items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 font-semibold text-[var(--color-action)] underline underline-offset-4"
      >
        {mobileAppAvailability.android.label}
      </a>
      <p className="text-[var(--color-text-muted)]">Android access currently requires an invitation to testing.</p>
      <p className="font-medium text-[var(--color-text-muted)]">{mobileAppAvailability.ios.label}</p>
    </div>
  );
}

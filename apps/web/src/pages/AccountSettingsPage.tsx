import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { Bell, ChevronRight, CircleHelp, FileText, ShieldCheck, Sun } from 'lucide-react';
import { useAuth } from '@/contexts/useAuth';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { useAppearance } from '@/theme/useAppearance';
import {
  DashboardLayout,
  driverNavGroups,
  guardianNavGroups,
} from '@/components/layout/DashboardLayout';
import { PageHeader } from '@/components/ui/PageHeader';
import { Card } from '@/components/ui/Card';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';

const rowClass =
  'flex min-h-14 w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-[var(--color-text)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--color-focus)]';
const appearanceLabels = { system: 'Follow phone settings', light: 'Light', dark: 'Dark' };

function AccountLink({ to, children, icon }: { to: string; children: ReactNode; icon: ReactNode }) {
  return (
    <Link to={to} className={rowClass}>
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
      <ChevronRight className="h-5 w-5 shrink-0" aria-hidden />
    </Link>
  );
}

export function AccountSettingsPage() {
  const { profile, loading, signOut, refreshProfile } = useAuth();
  const surface = useAppSurface();
  const navigate = useNavigate();
  const { preference, setPreference } = useAppearance();
  const dialog = useRef<HTMLDialogElement>(null);
  const appearanceButton = useRef<HTMLButtonElement>(null);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const [retrying, setRetrying] = useState(false);
  useEffect(() => {
    if (!appearanceOpen) return;
    const element = dialog.current;
    const trigger = appearanceButton.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = previousOverflow;
      trigger?.focus();
    };
  }, [appearanceOpen]);
  if (surface !== 'native-mobile')
    return (
      <Navigate
        to={profile?.role === 'driver' ? '/driver/settings' : '/notifications/settings'}
        replace
      />
    );
  const driver = profile?.role === 'driver';
  async function logout() {
    if (busy) return;
    setBusy(true);
    setSignOutError(false);
    try {
      await signOut();
      navigate('/login', { replace: true });
    } catch {
      setSignOutError(true);
    } finally {
      setBusy(false);
    }
  }
  async function retry() {
    setRetrying(true);
    try {
      await refreshProfile();
    } catch {
      /* Keep the retryable unavailable state. */
    } finally {
      setRetrying(false);
    }
  }
  const iconClass = 'h-5 w-5 shrink-0';
  return (
    <DashboardLayout
      title="Account"
      portal={driver ? 'driver' : 'parent'}
      navItems={[]}
      navGroups={driver ? driverNavGroups : guardianNavGroups}
    >
      <div className="mx-auto max-w-2xl space-y-5" data-ui="native-account-page">
        <PageHeader title="Account" />
        <Card className="p-4">
          {loading ? (
            <div
              role="status"
              aria-label="Loading account"
              className="h-16 animate-pulse rounded-lg bg-[var(--color-raised)]"
            />
          ) : profile ? (
            <div className="flex items-center gap-4">
              <Avatar name={profile.full_name || 'Account'} size="lg" />
              <div className="min-w-0">
                <p className="break-words font-bold">{profile.full_name || 'Account'}</p>
                <p className="break-all text-sm">{profile.email}</p>
                <p className="text-sm text-[var(--color-text-muted)]">
                  {driver ? 'Driver' : 'Guardian'}
                </p>
              </div>
            </div>
          ) : (
            <div role="status" className="space-y-3">
              <p>Account details could not load.</p>
              <Button onClick={() => void retry()} disabled={retrying}>
                {retrying ? 'Trying again…' : 'Try again'}
              </Button>
            </div>
          )}
        </Card>
        <section aria-labelledby="account-section" className="space-y-2">
          <h2 id="account-section" className="font-bold">
            Account
          </h2>
          <Card>
            <AccountLink
              to="/account/security"
              icon={<ShieldCheck className={iconClass} aria-hidden />}
            >
              Password &amp; security
            </AccountLink>
          </Card>
        </section>
        <section aria-labelledby="settings-section" className="space-y-2">
          <h2 id="settings-section" className="font-bold">
            Settings
          </h2>
          <Card className="divide-y divide-[var(--color-border)]">
            <AccountLink
              to={driver ? '/driver/settings' : '/notifications/settings'}
              icon={<Bell className={iconClass} aria-hidden />}
            >
              Notification settings
            </AccountLink>
            <button
              ref={appearanceButton}
              className={rowClass}
              onClick={() => setAppearanceOpen(true)}
              aria-haspopup="dialog"
            >
              <Sun className={iconClass} aria-hidden />
              <span className="min-w-0 flex-1">
                Appearance
                <span className="block text-sm text-[var(--color-text-muted)]">
                  {appearanceLabels[preference]}
                </span>
              </span>
              <ChevronRight className={iconClass} aria-hidden />
            </button>
          </Card>
        </section>
        <section aria-labelledby="help-section" className="space-y-2">
          <h2 id="help-section" className="font-bold">
            Help
          </h2>
          <Card className="divide-y divide-[var(--color-border)]">
            <AccountLink to="/support" icon={<CircleHelp className={iconClass} aria-hidden />}>
              Help &amp; support
            </AccountLink>
            <AccountLink to="/privacy" icon={<FileText className={iconClass} aria-hidden />}>
              Privacy notice
            </AccountLink>
          </Card>
        </section>
        {signOutError && (
          <p role="alert" className="text-[var(--color-danger-strong)]">
            Could not sign out. Try again.
          </p>
        )}
        <button
          onClick={() => void logout()}
          disabled={busy}
          className="min-h-12 w-full rounded-xl border border-[var(--color-danger-strong)] px-4 py-3 font-semibold text-[var(--color-danger-strong)] disabled:opacity-60"
        >
          {busy ? 'Signing out…' : 'Sign out'}
        </button>
        {appearanceOpen && (
          <dialog
            ref={dialog}
            aria-labelledby="appearance-title"
            onCancel={() => setAppearanceOpen(false)}
            onClose={() => setAppearanceOpen(false)}
            className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-[var(--color-surface)] p-6 text-[var(--color-text)] backdrop:bg-black/50"
          >
            <h2 id="appearance-title" className="text-xl font-bold">
              Appearance
            </h2>
            <fieldset className="my-4">
              <legend className="sr-only">Appearance</legend>
              {(['system', 'light', 'dark'] as const).map((value) => (
                <label key={value} className="flex min-h-12 items-center gap-3">
                  <input
                    type="radio"
                    name="appearance"
                    value={value}
                    checked={preference === value}
                    onChange={() => setPreference(value)}
                  />
                  {appearanceLabels[value]}
                </label>
              ))}
            </fieldset>
            <div className="flex justify-end">
              <Button onClick={() => setAppearanceOpen(false)}>Done</Button>
            </div>
          </dialog>
        )}
      </div>
    </DashboardLayout>
  );
}

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { PublicLayout } from '@/components/layout/PublicLayout';
import {
  DashboardLayout,
  driverNavGroups,
  guardianNavGroups,
} from '@/components/layout/DashboardLayout';
import { AppLoadingScreen } from '@/components/ui/AppLoadingScreen';
import { BrandMark } from '@/components/ui/BrandMark';
import { useAppSurface } from '@/contexts/AppSurfaceContext';
import { adminRoles, getDashboardPath } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { supabase, supabaseConfigError } from '@/lib/supabase';

interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

function qrSource(value: string) {
  return value.startsWith('data:')
    ? value
    : `data:image/svg+xml;utf-8,${encodeURIComponent(value)}`;
}

function MfaLayout({ children }: { children: ReactNode }) {
  const surface = useAppSurface();
  const { profile } = useAuth();
  const location = useLocation();
  if (
    location.pathname === '/account/security' &&
    (profile?.role === 'driver' || profile?.role === 'guardian')
  ) {
    const driver = profile.role === 'driver';
    return (
      <DashboardLayout
        title="Multi-factor authentication"
        portal={driver ? 'driver' : 'parent'}
        navItems={[]}
        navGroups={driver ? driverNavGroups : guardianNavGroups}
      >
        {children}
      </DashboardLayout>
    );
  }
  if (surface === 'web')
    return (
      <PublicLayout>
        <main>{children}</main>
      </PublicLayout>
    );
  return (
    <div className="min-h-screen bg-[var(--color-canvas)]" data-ui="public-shell">
      <header className="border-b border-slate-200 bg-white px-5 py-4" data-ui="public-app-bar">
        <BrandMark className="text-2xl" />
      </header>
      <main>{children}</main>
    </div>
  );
}

export function MfaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { profile, mfaStatus, mfaLoading, refreshMfa, signOut } = useAuth();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(
    location.state?.removeAuthenticator === true &&
      !!profile &&
      !adminRoles.some((role) => role === profile.role) &&
      mfaStatus.currentLevel === 'aal2' &&
      mfaStatus.verifiedFactors.some((factor) => factor.factorType === 'totp'),
  );

  const verifiedFactor = mfaStatus.verifiedFactors.find((factor) => factor.factorType === 'totp');
  const factorId = enrollment?.factorId ?? verifiedFactor?.id ?? null;
  const isVerifiedSession = mfaStatus.currentLevel === 'aal2';
  const isAdmin = profile
    ? adminRoles.includes(profile.role as (typeof adminRoles)[number])
    : false;
  const managing = location.pathname === '/account/security';

  const heading = useMemo(() => {
    if (removing) return 'Verify to remove authenticator';
    if (isVerifiedSession && verifiedFactor) return 'Multi-factor authentication is active';
    if (verifiedFactor) return 'Enter your authenticator code';
    return isAdmin ? 'Protect this administrator account' : 'Set up multi-factor authentication';
  }, [isAdmin, isVerifiedSession, removing, verifiedFactor]);

  useEffect(() => {
    if (!mfaLoading && profile && isVerifiedSession) {
      setError(null);
    }
  }, [isVerifiedSession, mfaLoading, profile]);

  if (!profile) return <Navigate to="/login" replace />;
  if (mfaLoading) return <AppLoadingScreen />;
  const returnTo: unknown = location.state?.returnTo;
  const settingsPath =
    profile.role === 'driver'
      ? '/driver/settings'
      : isAdmin && profile.role !== 'platform_super_admin'
        ? '/admin/settings'
        : '/notifications/settings';
  const destination = managing
    ? settingsPath
    : typeof returnTo === 'string' &&
        returnTo.startsWith('/') &&
        !returnTo.startsWith('//') &&
        !returnTo.includes('\\') &&
        !returnTo.startsWith('/mfa')
      ? returnTo
      : getDashboardPath(profile.role);

  async function beginEnrollment() {
    if (!supabase) {
      setError(supabaseConfigError ?? 'Supabase is not configured.');
      return;
    }
    const client = supabase;
    setBusy(true);
    setError(null);
    try {
      const listed = await client.auth.mfa.listFactors();
      if (listed.error) throw new Error(listed.error.message);
      const cleanup = await Promise.all(
        listed.data.all
          .filter((factor) => factor.factor_type === 'totp' && factor.status !== 'verified')
          .map((factor) => client.auth.mfa.unenroll({ factorId: factor.id })),
      );
      const cleanupError = cleanup.find((result) => result.error)?.error;
      if (cleanupError) throw new Error(cleanupError.message);

      const result = await client.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'SafeBus authenticator',
      });
      if (result.error) throw new Error(result.error.message);
      setEnrollment({
        factorId: result.data.id,
        qrCode: result.data.totp.qr_code,
        secret: result.data.totp.secret,
      });
    } catch (enrollError) {
      setError(enrollError instanceof Error ? enrollError.message : 'Unable to start MFA setup.');
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !factorId) return;
    if (!/^\d{6}$/.test(code)) {
      setError('Enter the six-digit code from your authenticator app.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      const result = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (result.error) {
        void supabase.rpc('record_own_auth_event', {
          p_action: 'auth.mfa_challenge_failed',
          p_outcome: 'failure',
          p_detail: {},
        });
        throw new Error(result.error.message);
      }
      if (removing) {
        // Always prove possession with a fresh code, even in an AAL2 session.
        const removed = await supabase.auth.mfa.unenroll({ factorId });
        if (removed.error) throw new Error(removed.error.message);
        const refreshed = await supabase.auth.refreshSession();
        if (refreshed.error) throw new Error(refreshed.error.message);
        await refreshMfa();
        void supabase.rpc('record_own_auth_event', {
          p_action: 'auth.mfa_removed',
          p_outcome: 'success',
          p_detail: {},
        });
        setRemoving(false);
        setCode('');
        if (!isAdmin) navigate(settingsPath, { replace: true });
        return;
      }
      await refreshMfa();
      void supabase.rpc('record_own_auth_event', {
        p_action: enrollment ? 'auth.mfa_enrolled' : 'auth.login',
        p_outcome: 'success',
        p_detail: { mfa: true },
      });
      navigate(destination, { replace: true });
    } catch (verifyError) {
      setError(
        verifyError instanceof Error ? verifyError.message : 'Unable to verify the MFA code.',
      );
    } finally {
      setBusy(false);
    }
  }

  function requestRemoval() {
    if (!verifiedFactor || !isVerifiedSession) return;
    setError(null);
    setCode('');
    setRemoving(true);
  }

  return (
    <MfaLayout>
      <section
        aria-labelledby="mfa-heading"
        className="mx-auto flex min-h-[calc(100svh-184px)] w-full max-w-xl items-start px-4 py-6 sm:items-center sm:px-6 sm:py-12"
      >
        <Card className="w-full break-words p-5 sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <h1
            id="mfa-heading"
            className="mt-4 text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl"
          >
            {heading}
          </h1>
          {isAdmin && !removing && (
            <p className="mt-3 text-gray-600">MFA is required for administrator accounts.</p>
          )}

          {error && (
            <div
              className="mt-5 rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm font-medium text-danger-700"
              role="alert"
            >
              {error}
            </div>
          )}

          {isVerifiedSession && verifiedFactor && !removing ? (
            <div className="mt-6 space-y-4">
              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={() => navigate(destination)}>
                  {managing ? 'Back to settings' : 'Continue'}
                </Button>
                {verifiedFactor && (
                  <Button type="button" variant="danger" loading={busy} onClick={requestRemoval}>
                    Remove authenticator
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <div className="mt-6 space-y-5">
              {!verifiedFactor && !enrollment && (
                <Button type="button" loading={busy} onClick={() => void beginEnrollment()}>
                  Set up authenticator app
                </Button>
              )}

              {enrollment && (
                <div className="space-y-4 rounded-xl border border-slate-200 p-4">
                  <p className="text-sm font-semibold text-navy-900">
                    Scan this code with your authenticator app, then enter the six-digit code.
                  </p>
                  <img
                    src={qrSource(enrollment.qrCode)}
                    alt="Authenticator enrollment QR code"
                    className="mx-auto aspect-square h-auto w-52 max-w-full rounded-lg bg-white p-2"
                  />
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Manual setup key
                    </p>
                    <code className="mt-1 block break-all rounded bg-slate-100 p-2 text-sm text-slate-800">
                      {enrollment.secret}
                    </code>
                  </div>
                </div>
              )}

              {factorId && (
                <form className="space-y-4" onSubmit={verify}>
                  <Field label="Six-digit authenticator code" htmlFor="mfa-code" required>
                    <Input
                      id="mfa-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]{6}"
                      maxLength={6}
                      value={code}
                      onChange={(event) =>
                        setCode(event.target.value.replace(/\D/g, '').slice(0, 6))
                      }
                      required
                    />
                  </Field>
                  <Button type="submit" fullWidth loading={busy}>
                    <KeyRound className="h-4 w-4" aria-hidden />
                    {removing
                      ? 'Verify and remove authenticator'
                      : enrollment
                        ? 'Enable MFA'
                        : 'Verify and continue'}
                  </Button>
                </form>
              )}
            </div>
          )}

          {!isAdmin && managing && !verifiedFactor && (
            <Link
              to={settingsPath}
              className="mt-5 inline-flex min-h-11 items-center font-semibold text-navy-700"
            >
              Back to settings
            </Link>
          )}
          {removing && (
            <Button
              type="button"
              variant="secondary"
              className="mt-4"
              disabled={busy}
              onClick={() => {
                setRemoving(false);
                setCode('');
                setError(null);
              }}
            >
              Cancel
            </Button>
          )}

          <Link
            to="/privacy#contact"
            className="mt-5 block py-2 text-sm font-semibold text-navy-700 underline"
          >
            Need help accessing your account?
          </Link>

          <button
            type="button"
            className="mt-6 inline-flex min-h-11 items-center text-sm font-semibold text-slate-600 hover:text-slate-900"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </Card>
      </section>
    </MfaLayout>
  );
}

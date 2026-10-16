import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { adminRoles, getDashboardPath } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { supabase, supabaseConfigError } from '@/lib/supabase';

interface Enrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

function qrSource(value: string) {
  return value.startsWith('data:') ? value : `data:image/svg+xml;utf-8,${value}`;
}

export function MfaPage() {
  const navigate = useNavigate();
  const { profile, mfaStatus, mfaLoading, refreshMfa, signOut } = useAuth();
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verifiedFactor = mfaStatus.verifiedFactors.find(
    (factor) => factor.factorType === 'totp',
  );
  const factorId = enrollment?.factorId ?? verifiedFactor?.id ?? null;
  const isVerifiedSession = mfaStatus.currentLevel === 'aal2';
  const isAdmin = profile
    ? adminRoles.includes(profile.role as (typeof adminRoles)[number])
    : false;

  const heading = useMemo(() => {
    if (isVerifiedSession) return 'Multi-factor authentication is active';
    if (verifiedFactor) return 'Enter your authenticator code';
    return 'Protect this administrator account';
  }, [isVerifiedSession, verifiedFactor]);

  useEffect(() => {
    if (!mfaLoading && profile && isVerifiedSession) {
      setError(null);
    }
  }, [isVerifiedSession, mfaLoading, profile]);

  if (!profile || !isAdmin) return <Navigate to="/login" replace />;
  const adminProfile = profile;

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
      await Promise.all(
        listed.data.all
          .filter((factor) => factor.factor_type === 'totp' && factor.status !== 'verified')
          .map((factor) => client.auth.mfa.unenroll({ factorId: factor.id })),
      );

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
      await refreshMfa();
      void supabase.rpc('record_own_auth_event', {
        p_action: enrollment ? 'auth.mfa_enrolled' : 'auth.login',
        p_outcome: 'success',
        p_detail: { mfa: true },
      });
      navigate(getDashboardPath(adminProfile.role), { replace: true });
    } catch (verifyError) {
      setError(
        verifyError instanceof Error ? verifyError.message : 'Unable to verify the MFA code.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor() {
    if (!supabase || !verifiedFactor || !isVerifiedSession) return;
    setBusy(true);
    setError(null);
    try {
      const result = await supabase.auth.mfa.unenroll({ factorId: verifiedFactor.id });
      if (result.error) throw new Error(result.error.message);
      await supabase.auth.refreshSession();
      await refreshMfa();
      void supabase.rpc('record_own_auth_event', {
        p_action: 'auth.mfa_removed',
        p_outcome: 'success',
        p_detail: {},
      });
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove MFA.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-xl items-center px-4 py-12 sm:px-6">
        <Card className="w-full p-6 sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
            <ShieldCheck className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-navy-900">{heading}</h1>
          <p className="mt-3 text-gray-600">
            SafeBus administrator accounts require a verified authenticator-app code before the
            admin portal or sensitive actions are available.
          </p>

          {error && (
            <div className="mt-5 rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm font-medium text-danger-700" role="alert">
              {error}
            </div>
          )}

          {isVerifiedSession ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-sm text-success-800">
                This session has completed MFA. You can continue to SafeBus administration.
              </div>
              <div className="flex flex-wrap gap-3">
                <Button type="button" onClick={() => navigate(getDashboardPath(adminProfile.role))}>
                  Continue to dashboard
                </Button>
                {verifiedFactor && (
                  <Button type="button" variant="danger" loading={busy} onClick={() => void removeFactor()}>
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
                    className="mx-auto h-52 w-52 rounded-lg bg-white p-2"
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
                      onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                      required
                    />
                  </Field>
                  <Button type="submit" fullWidth loading={busy}>
                    <KeyRound className="h-4 w-4" aria-hidden />
                    Verify and continue
                  </Button>
                </form>
              )}
            </div>
          )}

          <button
            type="button"
            className="mt-6 text-sm font-semibold text-slate-600 hover:text-slate-900"
            onClick={() => void signOut()}
          >
            Sign out
          </button>
        </Card>
      </main>
    </PublicLayout>
  );
}

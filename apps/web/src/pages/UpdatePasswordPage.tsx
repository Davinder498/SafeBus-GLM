import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { KeyRound } from 'lucide-react';
import { MobileAccountReady } from '@/components/auth/MobileAccountReady';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import {
  getDashboardPath,
  getSurfaceAccessMessage,
  isRoleAllowedOnSurface,
} from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { useAppSurface } from '@/contexts/AppSurfaceContext';

const minimumPasswordLength = 12;

function readRecoveryError(): string | null {
  // Keep a failed verification across remounts; only a confirmed native
  // exchange clears it. Reading state must not consume it (StrictMode).
  return sessionStorage.getItem('safebus.passwordRecoveryError');
}

export function UpdatePasswordPage() {
  const navigate = useNavigate();
  const appSurface = useAppSurface();
  const {
    session,
    profile,
    loading,
    authError,
    configError,
    updatePassword,
    completeInvitation,
    signOut,
  } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [surfaceCompletion, setSurfaceCompletion] = useState<string | null>(null);
  const [mobileReady, setMobileReady] = useState(false);
  const [recoveryError, setRecoveryError] = useState(readRecoveryError);

  useEffect(() => {
    // Reopening an Android reset link can return to this already-mounted page.
    // Read the new result instead of retaining the previous attempt's banner.
    function refreshRecoveryResult() {
      setRecoveryError(readRecoveryError());
      setError(null);
    }
    window.addEventListener('popstate', refreshRecoveryResult);
    return () => window.removeEventListener('popstate', refreshRecoveryResult);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (password.length < minimumPasswordLength) {
      setError(`Use at least ${minimumPasswordLength} characters for your password.`);
      return;
    }
    if (password !== confirmation) {
      setError('The passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      // An administrator may resend the initial invitation using Supabase's
      // recovery email. Updating the password alone must not leave that profile
      // in the invited state; complete the existing server-authorized activation.
      let nextProfile = profile;
      if (profile?.status === 'invited') {
        nextProfile = await completeInvitation(password);
      } else {
        await updatePassword(password);
      }
      if (!nextProfile || nextProfile.status !== 'active') {
        throw new Error('SafeBus could not verify this account. Contact your administrator.');
      }
      if (!isRoleAllowedOnSurface(nextProfile.role, appSurface)) {
        await signOut();
        if (nextProfile.role === 'driver' || nextProfile.role === 'guardian') {
          setMobileReady(true);
        } else {
          setSurfaceCompletion(getSurfaceAccessMessage(appSurface));
        }
        return;
      }
      navigate(
        nextProfile.role === 'tenant_admin' && profile?.status === 'invited'
          ? '/admin/settings/billing'
          : getDashboardPath(nextProfile.role),
        { replace: true },
      );
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100svh-184px)] w-full max-w-lg items-start px-4 py-6 sm:items-center sm:px-6 sm:py-12">
        <Card className="w-full break-words p-5 sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
            <KeyRound className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight text-navy-900 sm:text-3xl">
            Choose a new password
          </h1>
          <p className="mt-3 text-gray-600">
            Enter and confirm the new password for your SafeBus account.
          </p>

          {(configError || recoveryError || error) && (
            <div
              className="mt-5 rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm font-medium text-danger-700"
              role="alert"
            >
              {configError ?? recoveryError ?? error}
              {recoveryError && (
                <Link
                  to="/reset-password"
                  className="mt-3 block font-semibold underline underline-offset-4"
                >
                  Request another reset link
                </Link>
              )}
            </div>
          )}

          {mobileReady && <MobileAccountReady passwordReset={profile?.status !== 'invited'} />}

          {surfaceCompletion && (
            <div
              className="mt-6 rounded-lg border border-success-200 bg-success-50 p-4 text-sm font-medium text-success-800"
              role="status"
            >
              {surfaceCompletion}
            </div>
          )}

          {!surfaceCompletion && !mobileReady && !loading && !session && !recoveryError && (
            <div className="mt-6">
              <div className="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
                {authError ?? 'This password reset link is invalid or expired. Request a new link.'}
              </div>
              <Link
                to="/reset-password"
                className="mt-5 inline-flex font-semibold text-navy-700 hover:text-navy-900"
              >
                Request another reset link
              </Link>
            </div>
          )}

          {!surfaceCompletion && !mobileReady && loading && (
            <p className="mt-6 text-sm text-slate-600">Checking the secure reset link...</p>
          )}

          {!surfaceCompletion && !mobileReady && !loading && session && !recoveryError && (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <Field label="New password" htmlFor="new-password" required>
                <Input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={minimumPasswordLength}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </Field>
              <Field label="Confirm password" htmlFor="new-password-confirmation" required>
                <Input
                  id="new-password-confirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={minimumPasswordLength}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                />
              </Field>
              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={submitting}
                disabled={Boolean(configError)}
              >
                Update password
              </Button>
            </form>
          )}
        </Card>
      </main>
    </PublicLayout>
  );
}

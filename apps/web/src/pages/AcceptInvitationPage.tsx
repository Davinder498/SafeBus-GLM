import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { getDashboardPath } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';

const minimumPasswordLength = 8;

export function AcceptInvitationPage() {
  const navigate = useNavigate();
  const { session, profile, loading, authError, configError, completeInvitation, signOut } =
    useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const nextProfile = await completeInvitation(password);
      navigate(getDashboardPath(nextProfile.role), { replace: true });
    } catch (setupError) {
      setError(
        setupError instanceof Error ? setupError.message : 'Unable to activate your account.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <PublicLayout>
        <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-lg items-center px-4 py-12 sm:px-6">
          <Card className="w-full p-8 text-center">
            <p className="text-lg font-bold text-navy-900">Checking your invitation</p>
            <p className="mt-2 text-gray-600">
              Please wait while SafeBus verifies the secure link.
            </p>
          </Card>
        </main>
      </PublicLayout>
    );
  }

  const unavailableStatus =
    profile?.status === 'suspended' || profile?.status === 'disabled' ? profile.status : null;

  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-lg items-center px-4 py-12 sm:px-6">
        <Card className="w-full p-6 sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
            <KeyRound className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-navy-900">
            Create your password
          </h1>
          <p className="mt-3 text-gray-600">
            Finish accepting your SafeBus invitation. After your password is saved, you will be
            taken to the dashboard for your assigned role.
          </p>

          {(configError || error) && (
            <div
              className="mt-5 rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm font-medium text-danger-700"
              role="alert"
            >
              {configError ?? error}
            </div>
          )}

          {session && profile?.status === 'active' && (
            <div className="mt-6">
              <div className="rounded-lg border border-success-200 bg-success-50 p-4 text-sm text-success-800">
                This browser is signed in as {profile.email}. That account is already active.
              </div>
              <div className="mt-5 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => navigate(getDashboardPath(profile.role), { replace: true })}
                >
                  Open dashboard
                </Button>
                <Button type="button" variant="secondary" onClick={() => void signOut()}>
                  Sign out
                </Button>
              </div>
            </div>
          )}

          {!session && (
            <div className="mt-6">
              <div className="rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
                {authError ??
                  'This invitation link is invalid or expired. Ask your administrator to resend it.'}
              </div>
              <Link
                to="/login"
                className="mt-5 inline-flex font-semibold text-navy-700 hover:text-navy-900"
              >
                Return to sign in
              </Link>
            </div>
          )}

          {session && unavailableStatus && (
            <div className="mt-6">
              <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
                This account is {unavailableStatus}. Ask your administrator to reactivate it.
              </div>
              <Button
                type="button"
                className="mt-5"
                variant="secondary"
                onClick={() => void signOut()}
              >
                Sign out
              </Button>
            </div>
          )}

          {session && !profile && (
            <div className="mt-6">
              <div className="rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm text-danger-700">
                {authError ?? 'SafeBus could not find the profile connected to this invitation.'}
              </div>
              <Button
                type="button"
                className="mt-5"
                variant="secondary"
                onClick={() => void signOut()}
              >
                Sign out
              </Button>
            </div>
          )}

          {session && profile?.status === 'invited' && (
            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <Field label="New password" htmlFor="invitation-password" required>
                <Input
                  id="invitation-password"
                  type="password"
                  autoComplete="new-password"
                  minLength={minimumPasswordLength}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </Field>
              <Field label="Confirm password" htmlFor="invitation-password-confirmation" required>
                <Input
                  id="invitation-password-confirmation"
                  type="password"
                  autoComplete="new-password"
                  minLength={minimumPasswordLength}
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  required
                />
              </Field>
              <p className="flex items-start gap-2 text-xs text-slate-500">
                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-success-600" aria-hidden />
                Use at least {minimumPasswordLength} characters. A password manager is recommended.
              </p>
              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={submitting}
                disabled={Boolean(configError)}
              >
                Create password and activate account
              </Button>
            </form>
          )}
        </Card>
      </main>
    </PublicLayout>
  );
}

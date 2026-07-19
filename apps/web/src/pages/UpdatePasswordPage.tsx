import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { KeyRound } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { getDashboardPath } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';

const minimumPasswordLength = 8;

export function UpdatePasswordPage() {
  const navigate = useNavigate();
  const { session, profile, loading, authError, configError, updatePassword } = useAuth();
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
      await updatePassword(password);
      navigate(profile?.status === 'active' ? getDashboardPath(profile.role) : '/login', {
        replace: true,
      });
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-lg items-center px-4 py-12 sm:px-6">
        <Card className="w-full p-6 sm:p-8">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-navy-50 text-navy-700">
            <KeyRound className="h-5 w-5" aria-hidden />
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight text-navy-900">
            Choose a new password
          </h1>
          <p className="mt-3 text-gray-600">
            Enter and confirm the new password for your SafeBus account.
          </p>

          {(configError || error) && (
            <div
              className="mt-5 rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm font-medium text-danger-700"
              role="alert"
            >
              {configError ?? error}
            </div>
          )}

          {!loading && !session && (
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

          {loading && (
            <p className="mt-6 text-sm text-slate-600">Checking the secure reset link...</p>
          )}

          {!loading && session && (
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

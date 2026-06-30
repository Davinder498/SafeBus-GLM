import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/useAuth';

export function ResetPasswordPage() {
  const { requestPasswordReset, configError } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSuccess(null);
    setError(null);

    try {
      await requestPasswordReset(email);
      setSuccess('If an account exists for that email, a reset link has been sent.');
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : 'Unable to request reset link.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicLayout>
      <main className="mx-auto flex min-h-[calc(100vh-150px)] max-w-lg items-center px-4 py-12 sm:px-6">
        <Card className="w-full p-6 sm:p-8">
          <h1 className="text-3xl font-bold tracking-normal text-navy-900">Reset password</h1>
          <p className="mt-3 text-gray-600">
            Enter your account email and SafeBus will send a password reset link.
          </p>

          {(configError || error) && (
            <div className="mt-5 rounded-lg border border-danger-100 bg-danger-50 p-4 text-sm font-medium text-danger-700">
              {configError ?? error}
            </div>
          )}

          {success && (
            <div className="mt-5 rounded-lg border border-success-100 bg-success-50 p-4 text-sm font-medium text-success-700">
              {success}
            </div>
          )}

          <form className="mt-6" onSubmit={handleSubmit}>
            <label className="block text-sm font-semibold text-gray-700" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              placeholder="transportation@example.ca"
              className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
            />
            <Button
              type="submit"
              className="mt-5"
              fullWidth
              disabled={submitting || Boolean(configError)}
            >
              {submitting ? 'Sending...' : 'Send reset link'}
            </Button>
          </form>
          <Link
            to="/login"
            className="mt-5 inline-flex text-sm font-semibold text-navy-700 hover:text-navy-900"
          >
            Return to login
          </Link>
        </Card>
      </main>
    </PublicLayout>
  );
}

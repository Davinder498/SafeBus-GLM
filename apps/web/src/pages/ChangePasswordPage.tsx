import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { Eye, EyeOff, KeyRound, ShieldCheck } from 'lucide-react';
import { DashboardLayout, adminNavGroups, driverNavGroups, guardianNavGroups, platformNavGroups } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/contexts/useAuth';
import { changeOwnPassword } from '@/services/accountSecurityService';

const minimumPasswordLength = 12;
type PasswordFieldName = 'current' | 'next' | 'confirm';

export function ChangePasswordPage() {
  const { profile } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [visible, setVisible] = useState<PasswordFieldName[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const role = profile?.role;
  const portal = role === 'driver' ? 'driver' : role === 'guardian' ? 'parent' : 'admin';
  const groups = role === 'driver' ? driverNavGroups : role === 'guardian' ? guardianNavGroups
    : role === 'platform_super_admin' ? platformNavGroups : adminNavGroups;

  function toggle(name: PasswordFieldName) {
    setVisible((items) => items.includes(name) ? items.filter((item) => item !== name) : [...items, name]);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setError(null);
    setSaved(false);
    if (!current) {
      setError('Enter your current password.');
      return;
    }
    if (next.length < minimumPasswordLength) {
      setError(`Your new password must contain at least ${minimumPasswordLength} characters.`);
      return;
    }
    if (next === current) {
      setError('Choose a new password that is different from your current password.');
      return;
    }
    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }

    setSaving(true);
    try {
      await changeOwnPassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      setVisible([]);
      setSaved(true);
    } catch {
      setError('Unable to change your password right now. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  function passwordField(
    name: PasswordFieldName,
    label: string,
    id: string,
    value: string,
    onChange: (value: string) => void,
    autoComplete: string,
  ) {
    const show = visible.includes(name);
    return (
      <Field label={label} htmlFor={id} required>
        <div className="relative">
          <Input
            id={id}
            type={show ? 'text' : 'password'}
            autoComplete={autoComplete}
            value={value}
            onChange={(event) => { onChange(event.target.value); setError(null); setSaved(false); }}
            disabled={saving}
            minLength={name === 'current' ? undefined : minimumPasswordLength}
            className="pr-14"
            required
          />
          <button
            type="button"
            aria-label={`${show ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
            aria-pressed={show}
            onClick={() => toggle(name)}
            className="absolute right-1 top-1 inline-flex h-9 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
          >
            {show ? <EyeOff className="h-5 w-5" aria-hidden /> : <Eye className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </Field>
    );
  }

  return (
    <DashboardLayout title="Change password" portal={portal} navItems={[]} navGroups={groups}>
      <div className="mx-auto max-w-2xl space-y-5" data-ui="change-password-page">
        <PageHeader eyebrow="Account security" title="Change password" description="Protect your SafeBus account with a strong password." />
        <Card className="p-5 sm:p-7">
          <div className="mb-5 flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-navy-700" aria-hidden />
            <h2 className="text-lg font-bold text-navy-900">Update your password</h2>
          </div>
          {error && <p role="alert" className="mb-4 rounded-lg border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{error}</p>}
          {saved && (
            <div role="status" className="mb-4 rounded-lg border border-success-200 bg-success-50 p-4 text-sm font-medium text-success-800">
              Your password has been updated. Use your new password next time you sign in.
            </div>
          )}
          <form onSubmit={(event) => void submit(event)} className="space-y-4" autoComplete="on">
            {passwordField('current', 'Current password', 'current-password', current, setCurrent, 'current-password')}
            {passwordField('next', 'New password', 'new-password', next, setNext, 'new-password')}
            {passwordField('confirm', 'Confirm new password', 'confirm-password', confirm, setConfirm, 'new-password')}
            <p className="flex items-start gap-2 text-sm text-slate-600">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
              Use at least 12 characters. A password manager is recommended.
            </p>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <Link to="/account/security" className="inline-flex min-h-11 items-center text-sm font-semibold text-navy-700 underline underline-offset-4">
                Back to account security
              </Link>
              <Button type="submit" loading={saving}>Update password</Button>
            </div>
          </form>
          <p className="mt-5 text-xs leading-5 text-slate-500">
            Forgot your current password? Sign out and use the Forgot password link on the sign-in screen.
          </p>
        </Card>
      </div>
    </DashboardLayout>
  );
}

import { useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Mail, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { createTenantWithAdmin } from '@/services/onboardingService';
import { schoolAuthorityAccountTypes, schoolAuthorityTypeLabel } from '@/utils/schoolAuthority';

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm focus:ring-2 focus:ring-navy-500';
const initial = { tenantName: '', tenantType: 'school_group', adminName: '', adminEmail: '' };
export function TenantInvitationWizard({ onCreated }: { onCreated: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      const result = await createTenantWithAdmin({
        ...form,
        tenantName: form.tenantName.trim(),
        adminName: form.adminName.trim(),
        adminEmail: form.adminEmail.trim(),
      });
      setSuccess(
        `Invitation accepted by the email provider for ${result.recipientEmail}. Account activation is pending.`,
      );
      setStep(0);
      setForm(initial);
      try {
        await onCreated();
      } catch {
        setError(
          'Invitation sent. Refresh the school authority list to see the new school authority.',
        );
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The invitation could not be confirmed.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50/70 p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-navy-100 p-2.5 text-navy-700">
            <Mail aria-hidden className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-lg font-bold text-navy-900">Invite a new school authority</h2>
            <p className="mt-1 text-sm text-slate-600">
              Their administrator sets up the account, then chooses a subscription.
            </p>
          </div>
        </div>
        <ol aria-label="Invitation steps" className="mt-6 grid grid-cols-3 gap-2">
          {['School authority', 'First administrator', 'Review and invite'].map((label, i) => (
            <li
              key={label}
              aria-current={step === i ? 'step' : undefined}
              className={`border-t-2 pt-3 text-xs font-semibold sm:text-sm ${i <= step ? 'border-navy-700 text-navy-800' : 'border-slate-200 text-slate-500'}`}
            >
              <span className="mr-1.5">{i + 1}.</span>
              {label}
            </li>
          ))}
        </ol>
      </div>
      <form className="space-y-5 p-5 sm:p-6" onSubmit={(event) => void submit(event)}>
        {success && (
          <p role="status" className="rounded-lg bg-success-50 p-3 text-sm text-success-800">
            {success}
          </p>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-danger-50 p-3 text-sm text-danger-700">
            {error}
          </p>
        )}
        {step === 0 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="School authority name" htmlFor="tenant-name" required>
              <input
                id="tenant-name"
                autoComplete="organization"
                className={inputClass}
                placeholder="School authority name"
                value={form.tenantName}
                required
                minLength={2}
                maxLength={200}
                onChange={(e) => setForm({ ...form, tenantName: e.target.value })}
              />
            </Field>
            <Field label="School authority type" htmlFor="tenant-type">
              <select
                id="tenant-type"
                className={inputClass}
                value={form.tenantType}
                onChange={(e) => setForm({ ...form, tenantType: e.target.value })}
              >
                {schoolAuthorityAccountTypes.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="School authority admin full name" htmlFor="tenant-admin-name" required>
              <input
                id="tenant-admin-name"
                autoComplete="name"
                placeholder="School authority admin full name"
                className={inputClass}
                value={form.adminName}
                required
                minLength={2}
                maxLength={200}
                onChange={(e) => setForm({ ...form, adminName: e.target.value })}
              />
            </Field>
            <Field
              label="School authority admin email"
              htmlFor="tenant-admin-email"
              required
              hint="A secure account setup link will be sent to this address."
            >
              <input
                id="tenant-admin-email"
                type="email"
                autoComplete="email"
                placeholder="School authority admin email"
                className={inputClass}
                value={form.adminEmail}
                required
                maxLength={320}
                onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              />
            </Field>
          </div>
        )}
        {step === 2 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <h3 className="font-bold text-navy-900">Ready to invite</h3>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-slate-500">School authority</dt>
                <dd className="mt-1 break-words font-semibold">
                  {form.tenantName} · {schoolAuthorityTypeLabel(form.tenantType)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">First administrator</dt>
                <dd className="mt-1 break-words font-semibold">
                  {form.adminName}
                  <br />
                  {form.adminEmail}
                </dd>
              </div>
            </dl>
            <p className="mt-4 flex gap-2 text-sm leading-6 text-slate-600">
              <CheckCircle2 className="mt-1 h-4 w-4 shrink-0" aria-hidden />
              No subscription is purchased by sending this invitation. The administrator chooses a
              bus allowance and billing cycle through secure checkout, with a 14-day trial for new
              school authorities.
            </p>
          </div>
        )}
        <div className="flex flex-col-reverse justify-between gap-3 sm:flex-row">
          {step > 0 ? (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              leftIcon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => setStep(step - 1)}
            >
              Back
            </Button>
          ) : (
            <span />
          )}
          <Button
            type="submit"
            loading={busy}
            disabled={busy}
            rightIcon={<ArrowRight className="h-4 w-4" />}
          >
            {step === 2 ? 'Create school authority and send invitation' : 'Continue'}
          </Button>
        </div>
      </form>
    </Card>
  );
}

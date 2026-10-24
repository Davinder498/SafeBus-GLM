import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Building2, Check, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { createTenantWithAdmin } from '@/services/onboardingService';
import { schoolAuthorityAccountTypes, schoolAuthorityTypeLabel } from '@/utils/schoolAuthority';

const inputClass =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-navy-500';
const initial = { tenantName: '', tenantType: 'school_group', adminName: '', adminEmail: '' };
const steps = ['School authority', 'School authority admin', 'Review invitation'];
const descriptions = [
  'Enter the school authority’s official name and account type.',
  'Choose the person who will set up and manage this school authority’s account.',
  'Check these details before creating the school authority and sending its setup link.',
];

export function TenantInvitationWizard({ onCreated }: { onCreated: () => Promise<void> }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (step > 0) heading.current?.focus();
  }, [step]);

  function goToStep(next: number) {
    setError(null);
    setStep(next);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting.current) return;
    setError(null);
    setSuccess(null);
    if (step === 0 && form.tenantName.trim().length < 2) {
      setError('Enter a school authority name with at least two characters.');
      return;
    }
    if (step === 1 && form.adminName.trim().length < 2) {
      setError('Enter the school authority admin’s full name with at least two characters.');
      return;
    }
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    submitting.current = true;
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
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden" aria-labelledby="invite-authority-heading">
      <div className="grid lg:grid-cols-[240px_minmax(0,1fr)]">
        <div className="border-b border-slate-200 bg-slate-50 p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <Mail aria-hidden className="h-6 w-6 text-navy-700" />
          <h2 id="invite-authority-heading" className="mt-3 text-lg font-bold text-navy-900">
            Invite a school authority
          </h2>

          <ol aria-label="Invitation steps" className="mt-6 flex gap-3 lg:flex-col lg:gap-5">
            {steps.map((label, i) => (
              <li
                key={label}
                aria-current={step === i ? 'step' : undefined}
                className={`flex min-w-0 flex-1 flex-col gap-2 text-xs font-medium lg:flex-row lg:items-center lg:gap-3 lg:text-sm ${i <= step ? 'text-navy-800' : 'text-slate-500'}`}
              >
                <span
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${i === step ? 'border-navy-700 bg-navy-700 text-white' : i < step ? 'border-navy-200 bg-navy-100' : 'border-slate-300 bg-white'}`}
                >
                  {i < step ? <Check aria-hidden className="h-4 w-4" /> : i + 1}
                  {i < step && <span className="sr-only">Completed:</span>}
                </span>
                {label}
              </li>
            ))}
          </ol>
        </div>
        <form
          aria-label="Invite a school authority"
          aria-busy={busy}
          className="min-w-0 p-5 sm:p-8"
          onSubmit={(event) => void submit(event)}
        >
          <div className="mx-auto max-w-xl space-y-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Step {step + 1} of 3
              </p>
              <h3
                ref={heading}
                tabIndex={-1}
                className="mt-2 text-xl font-bold text-navy-900 focus:outline-none"
              >
                {steps[step]}
              </h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{descriptions[step]}</p>
            </div>
            {success && (
              <p
                role="status"
                className="rounded-lg bg-success-50 p-4 text-sm leading-6 text-success-800"
              >
                {success}
              </p>
            )}
            {error && (
              <p
                role="alert"
                className="rounded-lg bg-danger-50 p-4 text-sm leading-6 text-danger-700"
              >
                {error}
              </p>
            )}
            {step === 0 && (
              <div className="space-y-5">
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
                    aria-describedby="tenant-name-hint"
                    onChange={(e) => setForm({ ...form, tenantName: e.target.value })}
                  />
                  <p id="tenant-name-hint" className="text-xs leading-5 text-slate-500">
                    Use its official Division, District, Board, or Conseil scolaire name.
                  </p>
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
              <div className="space-y-5">
                <Field
                  label="School authority admin full name"
                  htmlFor="tenant-admin-name"
                  required
                >
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
                <Field label="School authority admin email" htmlFor="tenant-admin-email" required>
                  <input
                    id="tenant-admin-email"
                    type="email"
                    autoComplete="email"
                    placeholder="School authority admin email"
                    className={inputClass}
                    value={form.adminEmail}
                    required
                    maxLength={320}
                    aria-describedby="tenant-admin-email-hint"
                    onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  />
                  <p id="tenant-admin-email-hint" className="text-xs leading-5 text-slate-500">
                    A secure account setup link will be sent to this address.
                  </p>
                </Field>
              </div>
            )}
            {step === 2 && (
              <div className="space-y-5">
                <div className="divide-y divide-slate-200 rounded-xl border border-slate-200 px-4 sm:px-5">
                  {[
                    {
                      label: 'School authority',
                      icon: Building2,
                      name: form.tenantName.trim(),
                      detail: schoolAuthorityTypeLabel(form.tenantType),
                      target: 0,
                    },
                    {
                      label: 'School authority admin',
                      icon: Mail,
                      name: form.adminName.trim(),
                      detail: form.adminEmail.trim(),
                      target: 1,
                    },
                  ].map(({ label, icon: Icon, name, detail, target }) => (
                    <div key={label} className="flex items-start gap-3 py-5">
                      <Icon
                        aria-hidden
                        className="mt-1 hidden h-5 w-5 shrink-0 text-slate-400 sm:block"
                      />
                      <dl className="min-w-0 flex-1">
                        <dt className="text-xs font-medium text-slate-500">{label}</dt>
                        <dd className="mt-1 space-y-1 break-words text-sm">
                          <p className="font-semibold text-navy-900">{name}</p>
                          <p className="text-slate-600">{detail}</p>
                        </dd>
                      </dl>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        aria-label={`Edit ${label.toLowerCase()}`}
                        onClick={() => goToStep(target)}
                      >
                        Edit
                      </Button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 rounded-lg bg-slate-50 p-4 text-sm leading-6 text-slate-600">
                  <ShieldCheck aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-navy-700" />
                  <p>
                    <span className="font-semibold text-navy-900">No purchase is made now.</span>{' '}
                    The school authority admin chooses a bus allowance and billing cycle after
                    activation. New school authorities receive a 14-day trial through secure
                    checkout.
                  </p>
                </div>
              </div>
            )}
            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
              {step > 0 ? (
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  leftIcon={<ArrowLeft className="h-4 w-4" />}
                  onClick={() => goToStep(step - 1)}
                >
                  Back
                </Button>
              ) : (
                <span className="text-xs text-slate-500">Required fields are marked *</span>
              )}
              <Button
                type="submit"
                loading={busy}
                disabled={busy}
                rightIcon={
                  step === 2 ? <Mail className="h-4 w-4" /> : <ArrowRight className="h-4 w-4" />
                }
              >
                {step === 2 ? 'Send invitation' : 'Continue'}
              </Button>
            </div>
          </div>
        </form>
      </div>
    </Card>
  );
}

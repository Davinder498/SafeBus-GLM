import { useState, type FormEvent } from 'react';
import { Building2, CheckCircle2, Mail, ShieldCheck } from 'lucide-react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import {
  submitTenantInquiry,
  type InquiryTopic,
  type TenantInquiryInput,
} from '@/services/tenantInquiryService';

const topicLabels: Record<InquiryTopic, string> = {
  pilot_consultation: 'Pilot or consultation',
  pricing_procurement: 'Pricing or procurement',
  product_questions: 'Product questions',
  partnership: 'Partnership',
  other: 'Other',
};

type FormValues = Omit<TenantInquiryInput, 'requestId'>;
type FormErrors = Partial<Record<keyof FormValues, string>>;

const initialValues: FormValues = {
  name: '',
  workEmail: '',
  organization: '',
  role: '',
  topic: 'pilot_consultation',
  message: '',
  phone: '',
  website: '',
};

function validate(values: FormValues): FormErrors {
  const errors: FormErrors = {};
  if (!values.name.trim()) errors.name = 'Enter your full name.';
  if (!values.workEmail.trim() || !/^\S+@\S+\.\S+$/.test(values.workEmail.trim())) {
    errors.workEmail = 'Enter a valid work email.';
  }
  if (!values.organization.trim()) errors.organization = 'Enter your organization.';
  if (!values.role.trim()) errors.role = 'Enter your role or title.';
  if (!values.message.trim()) errors.message = 'Tell us how we can help.';
  return errors;
}

export function ContactPage() {
  const [values, setValues] = useState<FormValues>(initialValues);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  function update<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextErrors = validate(values);
    setErrors(nextErrors);
    setSubmitError(null);
    if (Object.keys(nextErrors).length > 0) return;

    setSubmitting(true);
    try {
      await submitTenantInquiry({
        ...values,
        requestId: crypto.randomUUID(),
        name: values.name.trim(),
        workEmail: values.workEmail.trim(),
        organization: values.organization.trim(),
        role: values.role.trim(),
        message: values.message.trim(),
        phone: values.phone?.trim(),
      });
      setSent(true);
      setValues(initialValues);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to send your inquiry.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <PublicLayout>
      <main className="bg-mesh">
        <section className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8 lg:py-20">
          <div className="self-start lg:sticky lg:top-24">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-navy-600">
              Contact BusSafe Alberta
            </p>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-slate-950 sm:text-5xl">
              Let&apos;s talk school transportation
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">
              Tell us about your school authority&apos;s transportation needs, procurement
              questions, or interest in a pilot. We&apos;ll review your inquiry and follow up using
              your work email.
            </p>
            <div className="mt-8 space-y-4 text-sm text-slate-600">
              <p className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-navy-600" aria-hidden />
                Built for Alberta school authorities and their transportation teams.
              </p>
              <p className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-navy-600" aria-hidden />
                Privacy-first: track the bus, not the child.
              </p>
              <p className="flex items-start gap-3">
                <Mail className="mt-0.5 h-5 w-5 shrink-0 text-navy-600" aria-hidden />
                Your contact details are used only to respond to this inquiry.
              </p>
            </div>
          </div>

          <Card className="p-6 shadow-lg sm:p-8">
            {sent ? (
              <div className="py-10 text-center" role="status">
                <CheckCircle2 className="mx-auto h-12 w-12 text-success-600" aria-hidden />
                <h2 className="mt-5 text-2xl font-bold text-slate-950">Inquiry sent</h2>
                <p className="mx-auto mt-3 max-w-md text-slate-600">
                  Thank you. The BusSafe Alberta team will review your message and follow up using
                  the work email you provided.
                </p>
                <Button
                  className="mt-6"
                  type="button"
                  variant="secondary"
                  onClick={() => setSent(false)}
                >
                  Send another inquiry
                </Button>
              </div>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-slate-950">Send an inquiry</h2>
                <p className="mt-2 text-sm text-slate-600">
                  All fields marked with an asterisk are required.
                </p>

                {submitError && (
                  <div
                    className="mt-5 rounded-lg border border-danger-200 bg-danger-50 p-4 text-sm font-medium text-danger-700"
                    role="alert"
                  >
                    {submitError}
                  </div>
                )}

                <form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={handleSubmit} noValidate>
                  <Field label="Full name" htmlFor="inquiry-name" required error={errors.name}>
                    <Input
                      id="inquiry-name"
                      autoComplete="name"
                      maxLength={100}
                      value={values.name}
                      invalid={Boolean(errors.name)}
                      onChange={(event) => update('name', event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Work email"
                    htmlFor="inquiry-email"
                    required
                    error={errors.workEmail}
                  >
                    <Input
                      id="inquiry-email"
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      value={values.workEmail}
                      invalid={Boolean(errors.workEmail)}
                      onChange={(event) => update('workEmail', event.target.value)}
                    />
                  </Field>
                  <Field
                    label="Organization or school authority"
                    htmlFor="inquiry-organization"
                    required
                    error={errors.organization}
                  >
                    <Input
                      id="inquiry-organization"
                      autoComplete="organization"
                      maxLength={200}
                      value={values.organization}
                      invalid={Boolean(errors.organization)}
                      onChange={(event) => update('organization', event.target.value)}
                    />
                  </Field>
                  <Field label="Role or title" htmlFor="inquiry-role" required error={errors.role}>
                    <Input
                      id="inquiry-role"
                      autoComplete="organization-title"
                      maxLength={120}
                      value={values.role}
                      invalid={Boolean(errors.role)}
                      onChange={(event) => update('role', event.target.value)}
                    />
                  </Field>
                  <Field label="Phone" htmlFor="inquiry-phone" hint="Optional">
                    <Input
                      id="inquiry-phone"
                      type="tel"
                      autoComplete="tel"
                      maxLength={40}
                      value={values.phone}
                      onChange={(event) => update('phone', event.target.value)}
                    />
                  </Field>
                  <Field label="Inquiry topic" htmlFor="inquiry-topic" required>
                    <Select
                      id="inquiry-topic"
                      value={values.topic}
                      onChange={(event) => update('topic', event.target.value as InquiryTopic)}
                    >
                      {Object.entries(topicLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    className="sm:col-span-2"
                    label="How can we help?"
                    htmlFor="inquiry-message"
                    required
                    error={errors.message}
                  >
                    <Textarea
                      id="inquiry-message"
                      rows={6}
                      maxLength={2000}
                      value={values.message}
                      invalid={Boolean(errors.message)}
                      onChange={(event) => update('message', event.target.value)}
                    />
                  </Field>

                  <div
                    className="absolute -left-[10000px] h-px w-px overflow-hidden"
                    aria-hidden="true"
                  >
                    <label htmlFor="inquiry-website">Website</label>
                    <input
                      id="inquiry-website"
                      name="website"
                      tabIndex={-1}
                      autoComplete="off"
                      value={values.website}
                      onChange={(event) => update('website', event.target.value)}
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <p className="rounded-lg bg-warning-50 p-4 text-sm text-warning-800">
                      Do not include student names, routes, addresses, health information, or other
                      sensitive personal information.
                    </p>
                    <p className="mt-3 text-xs leading-5 text-slate-500">
                      By submitting this form, you agree that BusSafe Alberta may use these business
                      contact details to respond to your inquiry. See our{' '}
                      <a
                        className="font-semibold text-navy-700 underline underline-offset-2"
                        href="/privacy"
                      >
                        privacy policy
                      </a>
                      .
                    </p>
                    <Button className="mt-5" type="submit" size="lg" loading={submitting}>
                      Send inquiry
                    </Button>
                  </div>
                </form>
              </>
            )}
          </Card>
        </section>
      </main>
    </PublicLayout>
  );
}

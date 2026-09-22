import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import type { SupportContact, SupportContactInput } from '@/services/supportDirectoryService';

const empty: SupportContactInput = {
  displayName: '',
  email: '',
  phone: null,
  websiteUrl: null,
  supportHours: null,
  instructions: null,
};

export function SupportContactForm({
  title,
  contact,
  saving,
  onSave,
}: {
  title: string;
  contact: SupportContact | null;
  saving: boolean;
  onSave(input: SupportContactInput): Promise<void>;
}) {
  const [form, setForm] = useState<SupportContactInput>(empty);
  useEffect(
    () =>
      setForm(
        contact
          ? {
              displayName: contact.displayName,
              email: contact.email,
              phone: contact.phone,
              websiteUrl: contact.websiteUrl,
              supportHours: contact.supportHours,
              instructions: contact.instructions,
            }
          : empty,
      ),
    [contact],
  );
  function update(key: keyof SupportContactInput, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    await onSave(form);
  }
  return (
    <Card className="p-5">
      <h2 className="text-xl font-bold text-navy-900">{title}</h2>
      <form className="mt-5 grid gap-4 md:grid-cols-2" onSubmit={(event) => void submit(event)}>
        <Field label="Support team name" htmlFor="support-name" required>
          <Input
            id="support-name"
            required
            maxLength={120}
            value={form.displayName}
            onChange={(e) => update('displayName', e.target.value)}
          />
        </Field>
        <Field label="Support email" htmlFor="support-email" required>
          <Input
            id="support-email"
            type="email"
            required
            maxLength={320}
            value={form.email}
            onChange={(e) => update('email', e.target.value)}
          />
        </Field>
        <Field label="Phone" htmlFor="support-phone" hint="Optional">
          <Input
            id="support-phone"
            type="tel"
            maxLength={40}
            value={form.phone ?? ''}
            onChange={(e) => update('phone', e.target.value)}
          />
        </Field>
        <Field label="Support website" htmlFor="support-website" hint="Optional HTTPS URL">
          <Input
            id="support-website"
            type="url"
            pattern="https://.*"
            maxLength={500}
            value={form.websiteUrl ?? ''}
            onChange={(e) => update('websiteUrl', e.target.value)}
          />
        </Field>
        <Field
          label="Support hours"
          htmlFor="support-hours"
          hint="Include time zone"
          className="md:col-span-2"
        >
          <Input
            id="support-hours"
            maxLength={240}
            placeholder="Monday–Friday, 8:00 AM–4:30 PM MT"
            value={form.supportHours ?? ''}
            onChange={(e) => update('supportHours', e.target.value)}
          />
        </Field>
        <Field
          label="Contact instructions"
          htmlFor="support-instructions"
          hint="Do not request student health or address information"
          className="md:col-span-2"
        >
          <Textarea
            id="support-instructions"
            maxLength={1000}
            value={form.instructions ?? ''}
            onChange={(e) => update('instructions', e.target.value)}
          />
        </Field>
        <div className="md:col-span-2">
          <Button type="submit" loading={saving} disabled={saving}>
            Save support details
          </Button>
        </div>
      </form>
    </Card>
  );
}

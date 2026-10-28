import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import type { SupportContactInput } from '@/services/supportDirectoryService';

export function SupportContactFields({
  form,
  update,
  includeAddress = false,
}: {
  form: SupportContactInput;
  update(key: keyof SupportContactInput, value: string): void;
  includeAddress?: boolean;
}) {
  return (
    <>
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
      {includeAddress && (
        <Field label="School authority address" htmlFor="support-address" className="md:col-span-2">
          <Textarea
            id="support-address"
            maxLength={600}
            value={form.address ?? ''}
            onChange={(e) => update('address', e.target.value)}
          />
        </Field>
      )}
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
    </>
  );
}

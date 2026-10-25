import { useEffect, useState, type FormEvent } from 'react';
import { SupportContactFields } from './SupportContactFields';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
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
  includeAddress = false,
}: {
  title: string;
  contact: SupportContact | null;
  saving: boolean;
  onSave(input: SupportContactInput): Promise<void>;
  includeAddress?: boolean;
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
              ...(includeAddress ? { address: contact.address ?? null } : {}),
            }
          : { ...empty, ...(includeAddress ? { address: null } : {}) },
      ),
    [contact, includeAddress],
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
        <SupportContactFields form={form} update={update} includeAddress={includeAddress} />
        <div className="md:col-span-2">
          <Button type="submit" loading={saving} disabled={saving}>
            Save support details
          </Button>
        </div>
      </form>
    </Card>
  );
}

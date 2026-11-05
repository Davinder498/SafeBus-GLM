import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import {
  getBusinessRecords,
  recordsRequest,
  record,
  saveBlob,
  type BusinessRecord,
  type RetentionRule,
} from '@/services/recordsRetentionService';
import { formatAdminTripTimestamp } from '@/utils/adminTripDates';
const input = 'mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-navy-900';
const when = (value: string | null) => (value ? formatAdminTripTimestamp(value) : 'Not set');
export function BusinessRecordsPanel({ rules }: { rules: RetentionRule[] }) {
  const [items, setItems] = useState<BusinessRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<BusinessRecord | 'new' | null>(null);
  const [confirming, setConfirming] = useState<BusinessRecord | null>(null);
  const [cursor, setCursor] = useState<Record<string, string>>({});
  const [selectedClass, setSelectedClass] = useState('inquiries');
  const businessRules = rules.filter((r) => r.scope === 'business');
  const load = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setItems(await getBusinessRecords(cursor));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load business records.');
    } finally {
      setBusy(false);
    }
  }, [cursor]);
  useEffect(() => {
    void load();
  }, [load]);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const data: Record<string, unknown> = {
        classification: String(form.get('classification')),
        continuingRelationship: form.get('continuingRelationship') === 'on',
      };
      for (const key of ['resolvedAt', 'minimumUntil', 'reviewAt'])
        if (form.get(key)) data[key] = new Date(String(form.get(key))).toISOString();
      for (const key of ['fiscalYearEnd', 'lateFiledAt'])
        if (form.get(key)) data[key] = String(form.get(key));
      if (editing !== 'new' && form.get('reopen') === 'on') data.reopen = true;
      if (editing !== 'new' && form.get('confirmReclassify') === 'on') data.confirm = 'reclassify';
      if (editing === 'new') {
        data.dataClass = selectedClass;
        data.reference = String(form.get('reference'));
        data.sourceType = String(form.get('sourceType'));
        if (form.get('provider')) data.provider = String(form.get('provider'));
        const sourceReference: Record<string, string> = {};
        for (const key of ['accountId', 'folderId', 'messageId', 'providerRecordId'])
          if (form.get(key)) sourceReference[key] = String(form.get(key));
        data.sourceReference = sourceReference;
      } else if (editing) data.id = editing.id;
      await recordsRequest(editing === 'new' ? 'business_create' : 'business_update', data);
      setEditing(null);
      setNotice(
        'Record classification saved. Eligible controlled copies are disposed automatically; provider copies require their own completion evidence.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save record.');
    } finally {
      setBusy(false);
    }
  }
  async function upload(item: BusinessRecord, file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {
      setError('Attachments are limited to 1 MB.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const attachment = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Unable to read this file.'));
        reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
        reader.readAsDataURL(file);
      });
      const inferred: Record<string, string> = {
        pdf: 'application/pdf',
        txt: 'text/plain',
        csv: 'text/csv',
        json: 'application/json',
      };
      const contentType = file.type || inferred[file.name.split('.').at(-1)?.toLowerCase() || ''];
      await recordsRequest('business_upload', { id: item.id, attachment, contentType });
      setNotice('Encrypted attachment uploaded and verified.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to upload attachment.');
    } finally {
      setBusy(false);
    }
  }
  async function download(item: BusinessRecord) {
    setBusy(true);
    setError('');
    try {
      const value = record(await recordsRequest('business_download', { id: item.id }));
      if (typeof value.dataBase64 !== 'string' || typeof value.contentType !== 'string')
        throw new Error('Invalid attachment response.');
      const bytes = Uint8Array.from(atob(value.dataBase64), (c) => c.charCodeAt(0));
      const extensions: Record<string, string> = {
        'application/pdf': 'pdf',
        'text/plain': 'txt',
        'text/csv': 'csv',
        'application/json': 'json',
      };
      saveBlob(
        new Blob([bytes], { type: value.contentType }),
        `safebus-${item.reference.replace(/[^A-Za-z0-9._-]/g, '-')}.${extensions[value.contentType] || 'bin'}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to download attachment.');
    } finally {
      setBusy(false);
    }
  }
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!confirming) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      await recordsRequest('business_provider_confirm', {
        id: confirming.id,
        evidenceReference: String(values.get('evidenceReference')),
        confirm: 'provider_disposed',
      });
      setConfirming(null);
      setNotice(
        'Operator confirmation recorded. The disposal worker will recheck the record and preservation requirements.',
      );
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to record confirmation.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">SafeBus business records</h2>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => void load()}>
            Refresh business records
          </Button>
          <Button
            disabled={busy || !!editing}
            onClick={() => {
              setEditing('new');
              setSelectedClass('inquiries');
            }}
          >
            Register record
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="text-danger-700">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {busy && items.length === 0 ? (
        <p role="status">Loading business records…</p>
      ) : items.length === 0 ? (
        <p>No registered business records.</p>
      ) : null}
      {items.map((item) => (
        <div key={item.id} className="space-y-2 rounded-lg border border-gray-200 p-4">
          <p className="font-semibold">
            {item.reference} ·{' '}
            {businessRules.find((r) => r.data_class === item.data_class)?.label || item.data_class}
          </p>
          <p className="text-sm">
            {item.disposal_state.replaceAll('_', ' ')} · {item.source_type.replaceAll('_', ' ')}
            {item.provider ? ` · ${item.provider}` : ''}
          </p>
          <p className="text-sm">
            Eligible:{' '}
            {item.eligible_at
              ? when(item.eligible_at)
              : 'Retention requirement or resolution outstanding'}{' '}
            · Review: {when(item.review_at)}
          </p>
          {item.disposal_state === 'provider_pending' && (
            <p className="text-sm font-semibold">
              Provider disposal is outstanding. A deleted database record is not confirmation that
              its mailbox or provider copy was removed.
            </p>
          )}
          {item.disposal_state !== 'disposed' && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                disabled={busy || !!editing}
                onClick={() => {
                  setEditing(item);
                  setSelectedClass(item.data_class);
                }}
              >
                Classify / resolve
              </Button>
              {item.object_key && (
                <Button variant="outline" disabled={busy} onClick={() => void download(item)}>
                  Download attachment
                </Button>
              )}
              {item.source_type === 'managed_file' && !item.object_key && (
                <label className="block text-sm font-semibold">
                  Attach PDF, text, CSV or JSON (1 MB maximum)
                  <input
                    type="file"
                    accept=".pdf,.txt,.csv,.json"
                    disabled={busy}
                    className="mt-1 block max-w-full text-sm"
                    onChange={(e) => void upload(item, e.target.files?.[0])}
                  />
                </label>
              )}
              {item.disposal_state === 'provider_pending' && (
                <Button variant="outline" disabled={busy} onClick={() => setConfirming(item)}>
                  Record provider disposal evidence
                </Button>
              )}
            </div>
          )}
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          variant="secondary"
          disabled={busy || Object.keys(cursor).length === 0}
          onClick={() => setCursor({})}
        >
          Newest business records
        </Button>
        <Button
          variant="secondary"
          disabled={busy || items.length < 50}
          onClick={() => {
            const last = items.at(-1);
            if (last) setCursor({ before: last.created_at, beforeId: last.id });
          }}
        >
          Older business records
        </Button>
      </div>
      {editing && (
        <form
          onSubmit={(e) => void save(e)}
          className="space-y-4 rounded-lg border border-navy-200 p-4"
        >
          <h3 className="font-bold">
            {editing === 'new' ? 'Register business record' : `Classify ${editing.reference}`}
          </h3>
          <p className="text-sm">
            Business records only. Do not upload student rosters, health information or custody
            details. Register each controlled or provider copy accurately; an inquiry’s received
            date is not its resolution date.
          </p>
          {editing === 'new' && (
            <>
              <label className="block">
                Data class
                <select
                  className={input}
                  value={selectedClass}
                  onChange={(e) => setSelectedClass(e.target.value)}
                >
                  {businessRules.map((r) => (
                    <option value={r.data_class} key={r.data_class}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                Internal reference
                <input
                  className={input}
                  name="reference"
                  required
                  maxLength={64}
                  pattern="[A-Za-z0-9][A-Za-z0-9._\/\-]{0,63}"
                />
              </label>
              <label className="block">
                Copy location
                <select className={input} name="sourceType">
                  <option value="managed_file">Encrypted SafeBus attachment</option>
                  <option value="external_mail">External mailbox copy</option>
                  <option value="provider_record">Provider-held record</option>
                  <option value="metadata_only">
                    Reference only, with no file or provider copy
                  </option>
                </select>
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  Provider (external copies)
                  <select className={input} name="provider">
                    <option value="">Not applicable</option>
                    {['zoho', 'resend', 'stripe', 'supabase', 'netlify', 'github', 'other'].map(
                      (v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  Provider record ID
                  <input name="providerRecordId" className={input} maxLength={200} />
                </label>
                <label>
                  Mailbox account ID
                  <input name="accountId" className={input} maxLength={200} />
                </label>
                <label>
                  Mailbox folder ID
                  <input name="folderId" className={input} maxLength={200} />
                </label>
                <label>
                  Mailbox message ID
                  <input name="messageId" className={input} maxLength={200} />
                </label>
              </div>
            </>
          )}
          {editing !== 'new' && (
            <label className="flex items-start gap-3">
              <input type="checkbox" name="reopen" className="mt-1 h-5 w-5" />
              Reopen this matter; pause resolution-based disposal.
            </label>
          )}
          <label className="block">
            Classification
            <select
              className={input}
              name="classification"
              defaultValue={editing === 'new' ? 'ordinary' : editing.classification}
            >
              {[
                ['ordinary', 'Ordinary record'],
                ['historical_corporate', 'Historical corporate record — no automatic expiry'],
                ['long_term_property', 'Long-term property record — no automatic expiry'],
                ['objection', 'Open objection / appeal — no automatic expiry'],
                ['personnel', 'Personnel or training'],
                ['privacy_case', 'Privacy, incident or legal case'],
                ['supplier_window', 'Verified supplier window'],
                ['key_custody', 'Required encryption key custody — no automatic expiry'],
              ].map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          {editing !== 'new' &&
            ['historical_corporate', 'long_term_property', 'objection', 'key_custody'].includes(
              editing.classification,
            ) && (
              <label className="flex items-start gap-3">
                <input type="checkbox" name="confirmReclassify" className="mt-1 h-5 w-5" />I
                verified that any change to the existing mandatory exception is permitted.
              </label>
            )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Resolved at
              <input className={input} type="datetime-local" name="resolvedAt" />
            </label>
            <label>
              Minimum retention until
              <input className={input} type="datetime-local" name="minimumUntil" />
            </label>
            <label>
              Next review
              <input className={input} type="datetime-local" name="reviewAt" />
            </label>
          </div>
          {selectedClass === 'financial_records' && (
            <div className="space-y-3">
              <p className="text-sm">
                Use the actual relevant corporate fiscal year end. Ordinary finance retention is six
                calendar years after that year end; late filing and exceptions can extend it. This
                is not a blanket instruction to delete every contract or invoice at six years.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <label>
                  Relevant fiscal year end
                  <input
                    className={input}
                    type="date"
                    name="fiscalYearEnd"
                    defaultValue={editing === 'new' ? '' : editing.fiscal_year_end || ''}
                  />
                </label>
                <label>
                  Late filing date (if applicable)
                  <input
                    className={input}
                    type="date"
                    name="lateFiledAt"
                    defaultValue={editing === 'new' ? '' : editing.late_filed_at || ''}
                  />
                </label>
              </div>
            </div>
          )}
          <label className="flex items-start gap-3">
            <input
              type="checkbox"
              name="continuingRelationship"
              className="mt-1 h-5 w-5"
              defaultChecked={editing !== 'new' && editing.continuing_relationship}
            />
            A continuing customer relationship requires this inquiry.
          </label>
          <p className="text-sm">
            Personnel, privacy and supplier records need a documented minimum and review. Reviews
            never automatically release preservation requests.
          </p>
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              Save classification
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {confirming && (
        <form
          onSubmit={(e) => void confirm(e)}
          className="space-y-3 rounded-lg border border-danger-200 p-4"
        >
          <h3 className="font-bold">Provider evidence for {confirming.reference}</h3>
          <p>
            Record this only after the provider copy was actually disposed of or its verified
            retention window expired. This is an operator attestation, not an automatic provider
            verification.
          </p>
          <label className="block">
            Evidence reference
            <input
              className={input}
              name="evidenceReference"
              required
              maxLength={128}
              pattern="[A-Za-z0-9][A-Za-z0-9._\/\-]{0,127}"
            />
          </label>
          <label className="flex items-start gap-3">
            <input type="checkbox" required className="mt-1 h-5 w-5" />I verified actual disposal
            and checked outstanding preservation and mandatory retention.
          </label>
          <div className="flex gap-2">
            <Button type="submit" loading={busy}>
              Record confirmation
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirming(null)}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

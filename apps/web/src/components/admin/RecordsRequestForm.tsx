import {
  fetchPlatformTenantSummaries,
  type PlatformTenantSummary,
} from '@/services/onboardingService';
import { useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/Button';
import {
  recordsRequest,
  getRecordOptions,
  type RetentionRule,
  type RecordOption,
} from '@/services/recordsRetentionService';
const input = 'mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 text-navy-900';
export function RecordsRequestForm({
  rules,
  platform,
  onSaved,
  onCancel,
}: {
  rules: RetentionRule[];
  platform: boolean;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState('hold');
  const [dataClass, setDataClass] = useState(
    rules.find((r) => r.data_class === (platform ? 'inquiries' : 'student_records'))?.data_class ||
      rules[0]?.data_class ||
      '',
  );
  const [scope, setScope] = useState('record');
  const [tenant, setTenant] = useState('');
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<RecordOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [authorities, setAuthorities] = useState<PlatformTenantSummary[]>([]);
  useEffect(() => {
    if (platform)
      void fetchPlatformTenantSummaries()
        .then(setAuthorities)
        .catch(() =>
          setError(
            'School authority list is unavailable. Refresh before requesting customer records.',
          ),
        );
  }, [platform]);
  const rule = rules.find((r) => r.data_class === dataClass);
  const customerRequest =
    platform && (rule?.scope === 'authority' || (rule?.scope === 'shared' && !!tenant));
  useEffect(() => {
    setOptions([]);
    setSearch('');
    setError('');
  }, [dataClass]);
  async function lookup(older = false) {
    setBusy(true);
    setError('');
    try {
      const next = await getRecordOptions(
        dataClass,
        search,
        older ? options.at(-1)?.id : undefined,
      );
      setOptions(older ? [...options, ...next] : next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to find records.');
    } finally {
      setBusy(false);
    }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const data: Record<string, unknown> = {
        dataClass,
        reference: String(values.get('reference')),
      };
      if (customerRequest) data.tenantId = tenant;
      if (scope === 'record') data.recordId = String(values.get('recordId'));
      else if (scope === 'range') {
        data.windowStart = new Date(String(values.get('windowStart'))).toISOString();
        data.windowEnd = new Date(String(values.get('windowEnd'))).toISOString();
      } else data.confirmAll = 'all_records';
      if (kind === 'hold') {
        data.reason = String(values.get('reason'));
        data.reviewAt = new Date(String(values.get('reviewAt'))).toISOString();
        if (values.get('minimumUntil'))
          data.minimumUntil = new Date(String(values.get('minimumUntil'))).toISOString();
        if (values.get('decisionUsedAt'))
          data.decisionUsedAt = new Date(String(values.get('decisionUsedAt'))).toISOString();
      }
      await recordsRequest(kind === 'hold' ? 'hold_create' : 'export_create', data);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to save request.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      onSubmit={(e) => void save(e)}
      className="space-y-4 rounded-xl border border-navy-200 p-4"
    >
      <h2 className="text-xl font-bold">New records request</h2>
      {error && (
        <p role="alert" className="text-danger-700">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label>
          Request type
          <select className={input} value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="hold">Preserve records</option>
            <option value="export">Download records</option>
          </select>
        </label>
        <label>
          Data class
          <select
            className={input}
            value={dataClass}
            onChange={(e) => setDataClass(e.target.value)}
          >
            {rules.map((r) => (
              <option key={r.data_class} value={r.data_class}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {platform && (rule?.scope === 'authority' || rule?.scope === 'shared') && (
        <label className="block">
          School authority {rule.scope === 'shared' ? '(leave blank for platform records)' : ''}
          <select
            className={input}
            value={tenant}
            onChange={(e) => setTenant(e.target.value)}
            required={rule.scope === 'authority'}
          >
            <option value="">
              {rule.scope === 'shared' ? 'Platform records' : 'Choose a school authority'}
            </option>
            {authorities
              .filter((a) => a.tenant_status === 'active')
              .map((a) => (
                <option key={a.tenant_id} value={a.tenant_id}>
                  {a.tenant_name}
                </option>
              ))}
          </select>
        </label>
      )}
      {customerRequest && (
        <p className="text-sm">
          A school authority admin must approve a platform download request. A preservation request
          protects the selected records while it is reviewed.
        </p>
      )}
      <label className="block">
        Internal reference
        <input
          className={input}
          name="reference"
          maxLength={64}
          required
          pattern="[A-Za-z0-9][A-Za-z0-9._\/\-]{0,63}"
        />
      </label>
      <p className="text-sm">
        Use a case or work reference without student names, health or custody details. Dates use
        this device’s local timezone. Already disposed records cannot be recovered.
      </p>
      <label className="block">
        Scope
        <select className={input} value={scope} onChange={(e) => setScope(e.target.value)}>
          <option value="record">Single record</option>
          <option value="range">Recorded date range</option>
          <option value="all">All records in this class</option>
        </select>
      </label>
      {scope === 'record' && (
        <div className="space-y-3">
          {!customerRequest && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <label className="flex-1">
                Find a record
                <input
                  className={input}
                  value={search}
                  maxLength={100}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() => void lookup()}
              >
                Search
              </Button>
            </div>
          )}
          {options.length > 0 ? (
            <label className="block">
              Record
              <select className={input} name="recordId" required>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label} · {o.id.slice(-8)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block">
              Record ID
              <input
                className={input}
                name="recordId"
                required
                placeholder={
                  customerRequest
                    ? 'Use the authority’s record reference'
                    : 'Search above or enter a known record ID'
                }
              />
            </label>
          )}
          {options.length >= 100 && options.length % 100 === 0 && (
            <Button
              type="button"
              variant="secondary"
              disabled={busy}
              onClick={() => void lookup(true)}
            >
              More matches
            </Button>
          )}
        </div>
      )}
      {scope === 'range' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label>
            From
            <input className={input} type="datetime-local" name="windowStart" required />
          </label>
          <label>
            Through
            <input className={input} type="datetime-local" name="windowEnd" required />
          </label>
        </div>
      )}
      {scope === 'all' && (
        <label className="flex items-start gap-3">
          <input type="checkbox" required className="mt-1 h-5 w-5" />
          This request intentionally covers this entire data class. Preservation can increase
          storage and stops routine disposal until explicitly released.
        </label>
      )}
      {kind === 'hold' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Reason
              <select className={input} name="reason">
                <option value="incident">Incident</option>
                <option value="dispute">Dispute</option>
                <option value="access_request">Access request</option>
                <option value="decision">Decision</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label>
              Next review
              <input className={input} name="reviewAt" type="datetime-local" required />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              Minimum retention until (optional)
              <input className={input} type="datetime-local" name="minimumUntil" />
            </label>
            <label>
              Decision used at (required for a decision)
              <input className={input} type="datetime-local" name="decisionUsedAt" />
            </label>
          </div>
          <p className="text-sm">
            Decision use adds a one-calendar-year minimum. Reviews do not release records. Mandatory
            requirements may require longer.
          </p>
        </>
      ) : (
        <p className="text-sm">
          Exports are prepared as verified encrypted chunks. Downloads require current access and
          recent sign-in. Server copies expire after 30 days; protect any copies you download under
          your own records policy.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          {kind === 'hold' ? 'Preserve records' : 'Prepare download'}
        </Button>
        <Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

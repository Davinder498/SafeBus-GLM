import { useCallback, useState } from 'react';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { searchAuditEvents } from '@/services/tenantAdminService';
import type { AuditEvent } from '@/services/tenantAdminService';

const ACTION_OPTIONS = [
  { value: '', label: 'All actions' },
  { value: 'admin.invited', label: 'Admin invited' },
  { value: 'admin.transferred', label: 'Admin transferred' },
  { value: 'admin.departed', label: 'Admin departed' },
  { value: 'admin.role_changed', label: 'Role changed' },
  { value: 'admin.recovered', label: 'Emergency recovery' },
  { value: 'bulk_import.validated', label: 'Bulk import validated' },
  { value: 'bulk_import.committed', label: 'Bulk import committed' },
  { value: 'tenant.suspended', label: 'Tenant suspended' },
  { value: 'tenant.reactivated', label: 'Tenant reactivated' },
  { value: 'invitation.created', label: 'Invitation created' },
  { value: 'invitation.revoked', label: 'Invitation revoked' },
  { value: 'auth.login', label: 'Login' },
  { value: 'auth.password_changed', label: 'Password changed' },
];

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function AdminAuditSearchPage() {
  const [action, setAction] = useState('');
  const [targetType, setTargetType] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [results, setResults] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    setHasSearched(true);
    try {
      const events = await searchAuditEvents({
        action: action || null,
        targetType: targetType || null,
        fromDate: fromDate ? new Date(fromDate).toISOString() : null,
        toDate: toDate ? new Date(toDate + 'T23:59:59').toISOString() : null,
        limit: 100,
      });
      setResults(events);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to search audit events.');
    } finally {
      setLoading(false);
    }
  }, [action, targetType, fromDate, toDate]);

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={[]} navGroups={adminNavGroups}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Audit"
          title="Audit trail search"
          description="Search the append-only audit trail for administrative actions, invitations, and lifecycle events. Each search is itself audited."
        />

        <Card className="p-5">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700" htmlFor="audit-action">
                Action
              </label>
              <select
                id="audit-action"
                value={action}
                onChange={(e) => setAction(e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm"
              >
                {ACTION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700" htmlFor="audit-target">
                Target type
              </label>
              <input
                id="audit-target"
                type="text"
                placeholder="e.g. profile, tenant, invitation"
                value={targetType}
                onChange={(e) => setTargetType(e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700" htmlFor="audit-from">
                From date
              </label>
              <input
                id="audit-from"
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700" htmlFor="audit-to">
                To date
              </label>
              <input
                id="audit-to"
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm"
              />
            </div>
          </div>
          <div className="mt-4">
            <Button type="button" onClick={handleSearch} loading={loading}>
              Search audit trail
            </Button>
          </div>
        </Card>

        {error && (
          <Card className="border-danger-200 bg-danger-50 p-4" role="alert">
            <p className="text-sm font-semibold text-danger-700">{error}</p>
          </Card>
        )}

        {loading && <DataState title="Searching" message="Querying audit events." />}
        {!loading && hasSearched && results.length === 0 && !error && (
          <DataState title="No events found" message="Try adjusting your filters." />
        )}

        {!loading && results.length > 0 && (
          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-lg font-bold text-navy-900">{results.length} event(s)</h2>
            </div>
            <div className="max-h-[600px] overflow-auto">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Action</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Target</th>
                    <th className="px-4 py-3">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {results.map((event) => (
                    <tr key={event.id}>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatDateTime(event.created_at)}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-navy-900">{event.action}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {event.actor_email ?? '—'}
                        {event.actor_role ? (
                          <span className="ml-2 text-xs text-slate-400">{event.actor_role}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {event.target_type ? (
                          <>
                            <span className="font-mono text-xs">{event.target_type}</span>
                            {event.target_label ? (
                              <span className="ml-2 text-xs text-slate-500">{event.target_label}</span>
                            ) : null}
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                            event.outcome === 'success'
                              ? 'bg-success-50 text-success-700'
                              : event.outcome === 'failure' || event.outcome === 'denied' || event.outcome === 'error'
                                ? 'bg-danger-50 text-danger-700'
                                : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {event.outcome}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
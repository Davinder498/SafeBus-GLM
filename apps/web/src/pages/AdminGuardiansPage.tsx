import { useState } from 'react';
import { AdminPagination } from '@/components/admin/AdminPagination';
import { StudentSearchPicker } from '@/components/admin/StudentSearchPicker';
import { DashboardLayout, adminNavItems } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';
import { usePaginatedAdminList } from '@/hooks/usePaginatedAdminList';
import { fetchAdminGuardianLinks, type GuardianLinkSummary } from '@/services/adminPaginationService';
import { createStudentGuardianLink, deactivateStudentGuardianLink } from '@/services/studentGuardianService';
import type { Guardian, GuardianStatus } from '@/types/studentGuardian';

const guardianStatusTone: Record<GuardianStatus, 'success' | 'warning' | 'danger' | 'neutral'> = { active: 'success', inactive: 'neutral', suspended: 'warning', archived: 'danger' };
type GuardianRow = Guardian & { active_link_count: number };

export function AdminGuardiansPage() {
  const { profile } = useAuth();
  const list = usePaginatedAdminList<GuardianRow>('guardians');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [linkingId, setLinkingId] = useState<string | null>(null);
  const [links, setLinks] = useState<GuardianLinkSummary[]>([]);
  const [studentId, setStudentId] = useState('');
  const [relationship, setRelationship] = useState('guardian');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [writeError, setWriteError] = useState<string | null>(null);
  const canWrite = !!profile && adminRoles.includes(profile.role as (typeof adminRoles)[number]);

  async function loadLinks(guardianId: string) {
    setLinks(await fetchAdminGuardianLinks(guardianId));
  }
  async function toggleLinks(guardianId: string) {
    if (expandedId === guardianId) { setExpandedId(null); return; }
    setExpandedId(guardianId); setWriteError(null);
    try { await loadLinks(guardianId); } catch (error) { setWriteError(error instanceof Error ? error.message : 'Unable to load links.'); }
  }
  async function createLink(guardianId: string) {
    if (!studentId || busy) return;
    setBusy(guardianId); setWriteError(null); setMessage(null);
    try {
      await createStudentGuardianLink({ studentId, guardianId, relationship, defaultTenantId: profile?.tenant_id ?? null });
      setStudentId(''); setLinkingId(null); setMessage('Student linked to guardian.');
      await Promise.all([loadLinks(guardianId), list.reload()]);
    } catch (error) { setWriteError(error instanceof Error ? error.message : 'Unable to create link.'); }
    finally { setBusy(null); }
  }
  async function deactivateLink(linkId: string, guardianId: string) {
    if (busy) return; setBusy(linkId); setWriteError(null);
    try { await deactivateStudentGuardianLink(linkId); setMessage('Guardian link deactivated.'); await Promise.all([loadLinks(guardianId), list.reload()]); }
    catch (error) { setWriteError(error instanceof Error ? error.message : 'Unable to deactivate link.'); }
    finally { setBusy(null); }
  }

  return (
    <DashboardLayout title="Admin Dashboard" portal="admin" navItems={adminNavItems}>
      <div className="space-y-6">
        <PageHeader eyebrow="Guardians" title="Guardians" description="Search and manage guardian records and linked students." />
        {writeError && <Card className="border-danger-200 bg-danger-50 p-4" role="alert"><p className="text-sm font-semibold text-danger-700">{writeError}</p></Card>}
        {message && <Card className="border-success-200 bg-success-50 p-4" role="status"><p className="text-sm font-semibold text-success-700">{message}</p></Card>}
        <div><label className="block text-sm font-semibold text-gray-700" htmlFor="guardian-search">Search guardians</label><input id="guardian-search" type="search" value={list.searchInput} onChange={(event) => list.setSearchInput(event.target.value)} placeholder="Search by name, email, phone, or status" className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3" /></div>
        {list.loading && <DataState title="Loading guardians" message="Fetching this page of guardian records." />}
        {list.error && <DataState title="Unable to load guardians" message={list.error} />}
        {!list.loading && !list.error && list.rows.length === 0 && <DataState title="No guardians match" message="Try a different search." />}
        {!list.loading && !list.error && list.rows.length > 0 && <section className="space-y-3">
          {list.rows.map((guardian) => {
            const expanded = expandedId === guardian.id; const linking = linkingId === guardian.id;
            return <Card key={guardian.id} className="p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-lg font-bold text-navy-900">{guardian.full_name}</h2><p className="text-sm text-gray-600">{guardian.email}</p></div><div className="flex flex-wrap gap-2"><StatusPill tone={guardianStatusTone[guardian.status]}>{guardian.status}</StatusPill><Button type="button" size="sm" variant="secondary" onClick={() => void toggleLinks(guardian.id)}>{expanded ? 'Hide links' : `View links (${guardian.active_link_count})`}</Button>{canWrite && guardian.status === 'active' && <Button type="button" size="sm" onClick={() => { setLinkingId(linking ? null : guardian.id); setStudentId(''); }}>{linking ? 'Cancel' : 'Add link'}</Button>}</div></div>
              {linking && <div className="mt-4 border-t pt-4"><label className="text-sm font-semibold text-gray-700">Student<StudentSearchPicker value={studentId} onChange={setStudentId} /></label><label className="mt-3 block text-sm font-semibold text-gray-700">Relationship<select value={relationship} onChange={(event) => setRelationship(event.target.value)} className="mt-2 w-full rounded-lg border border-gray-300 px-4 py-3"><option value="guardian">Guardian</option><option value="mother">Mother</option><option value="father">Father</option><option value="caregiver">Caregiver</option><option value="other">Other</option></select></label><Button type="button" size="sm" className="mt-3" disabled={!studentId || busy === guardian.id} onClick={() => void createLink(guardian.id)}>Save link</Button></div>}
              {expanded && <div className="mt-4 divide-y border-t pt-2"><h3 className="py-2 text-sm font-bold text-navy-900">Linked students</h3>{links.length === 0 && <p className="py-3 text-sm text-gray-600">No students linked.</p>}{links.map((link) => <div key={link.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-semibold text-navy-900">{link.student_name}</p><p className="text-xs text-gray-500">{link.relationship}</p></div><div className="flex items-center gap-2"><StatusPill tone={link.status === 'active' ? 'success' : 'neutral'}>{link.status}</StatusPill>{canWrite && link.status === 'active' && <Button type="button" size="sm" variant="ghost" disabled={busy === link.id} onClick={() => void deactivateLink(link.id, guardian.id)}>Deactivate link</Button>}</div></div>)}</div>}
            </Card>;
          })}
          <AdminPagination page={list.page} pageSize={list.pageSize} totalCount={list.totalCount} onPageChange={list.setPage} onPageSizeChange={list.setPageSize} />
        </section>}
      </div>
    </DashboardLayout>
  );
}

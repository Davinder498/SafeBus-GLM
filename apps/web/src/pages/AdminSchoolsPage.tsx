import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { AdminSettingsNav } from '@/components/settings/AdminSettingsNav';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import { StatusPill } from '@/components/ui/StatusPill';
import { useAuth } from '@/contexts/useAuth';
import {
  archiveTenantSchool,
  createTenantSchool,
  getVisibleSchools,
  restoreTenantSchool,
  updateTenantSchool,
} from '@/services/adminOrganizationService';
import type { School } from '@/types/organization';

interface SchoolFormState {
  name: string;
  city: string;
}

const emptyForm: SchoolFormState = { name: '', city: '' };

function statusTone(status: string) {
  if (status === 'active') return 'success' as const;
  if (status === 'suspended') return 'warning' as const;
  return 'neutral' as const;
}

export function AdminSchoolsPage() {
  const { profile } = useAuth();
  const canManage = profile?.role === 'tenant_admin';
  const [schools, setSchools] = useState<School[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<School | null>(null);
  const [form, setForm] = useState<SchoolFormState>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadSchools = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setSchools(await getVisibleSchools({ includeArchived: true }));
    } catch (schoolError) {
      setError(schoolError instanceof Error ? schoolError.message : 'Unable to load schools.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSchools();
  }, [loadSchools]);

  const sortedSchools = useMemo(
    () =>
      [...schools].sort((left, right) => {
        if (left.status === 'archived' && right.status !== 'archived') return 1;
        if (left.status !== 'archived' && right.status === 'archived') return -1;
        return left.name.localeCompare(right.name);
      }),
    [schools],
  );

  function openCreateForm() {
    setEditingSchool(null);
    setForm(emptyForm);
    setError(null);
    setSuccess(null);
    setFormOpen(true);
  }

  function openEditForm(school: School) {
    setEditingSchool(school);
    setForm({ name: school.name, city: school.city ?? '' });
    setError(null);
    setSuccess(null);
    setFormOpen(true);
  }

  function closeForm() {
    if (busy) return;
    setFormOpen(false);
    setEditingSchool(null);
    setForm(emptyForm);
  }

  async function submitSchool(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = form.name.trim();
    const city = form.city.trim();
    if (!name) {
      setError('School name is required.');
      return;
    }

    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const school = editingSchool
        ? await updateTenantSchool(editingSchool.id, { name, city })
        : await createTenantSchool({ name, city });
      setSchools((current) => {
        const exists = current.some((item) => item.id === school.id);
        return exists
          ? current.map((item) => (item.id === school.id ? school : item))
          : [...current, school];
      });
      setSuccess(editingSchool ? 'School details updated.' : 'School added to your directory.');
      setFormOpen(false);
      setEditingSchool(null);
      setForm(emptyForm);
    } catch (schoolError) {
      setError(schoolError instanceof Error ? schoolError.message : 'Unable to save the school.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteSchool() {
    if (!deleteTarget) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const archived = await archiveTenantSchool(deleteTarget.id);
      setSchools((current) =>
        current.map((school) => (school.id === archived.id ? archived : school)),
      );
      setSuccess(`${archived.name} was removed from the active school directory.`);
      setDeleteTarget(null);
    } catch (schoolError) {
      setError(schoolError instanceof Error ? schoolError.message : 'Unable to delete the school.');
    } finally {
      setBusy(false);
    }
  }

  async function restoreSchool(school: School) {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const restored = await restoreTenantSchool(school.id);
      setSchools((current) => current.map((item) => (item.id === restored.id ? restored : item)));
      setSuccess(`${restored.name} was restored.`);
    } catch (schoolError) {
      setError(
        schoolError instanceof Error ? schoolError.message : 'Unable to restore the school.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <DashboardLayout
      title="Admin Dashboard"
      portal="admin"
      navItems={[]}
      navGroups={adminNavGroups}
    >
      <div className="space-y-6">
        <PageHeader
          eyebrow="Settings"
          title="Schools"
          description="Maintain the nominal school directory for your tenant. Directory changes do not start, stop, or delete transportation operations or tenant access."
          action={
            canManage ? (
              <Button
                type="button"
                leftIcon={<Plus className="h-4 w-4" />}
                onClick={openCreateForm}
              >
                Add school
              </Button>
            ) : undefined
          }
        />

        <AdminSettingsNav role={profile?.role} />

        <Card className="border-navy-100 bg-navy-50 p-4">
          <p className="text-sm font-semibold text-navy-900">
            Schools are reference information only. Adding, editing, or deleting a school does not
            enable, suspend, or remove any transportation operation.
          </p>
        </Card>

        {error && (
          <Card className="border-danger-200 bg-danger-50 p-4">
            <p className="text-sm font-semibold text-danger-700" role="alert">
              {error}
            </p>
          </Card>
        )}
        {success && (
          <Card className="border-success-200 bg-success-50 p-4">
            <p className="text-sm font-semibold text-success-700" role="status">
              {success}
            </p>
          </Card>
        )}

        {formOpen && canManage && (
          <Card className="p-5">
            <form onSubmit={(event) => void submitSchool(event)}>
              <div>
                <h2 className="text-lg font-bold text-navy-900">
                  {editingSchool ? 'Edit school details' : 'Add school'}
                </h2>
                <p className="mt-1 text-sm text-slate-600">
                  Only the name is required. SafeBus Alberta records the province as Alberta.
                </p>
              </div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <div>
                  <label htmlFor="school-name" className="text-sm font-semibold text-slate-700">
                    School name
                  </label>
                  <input
                    id="school-name"
                    required
                    maxLength={200}
                    autoComplete="organization"
                    value={form.name}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, name: event.target.value }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
                  />
                </div>
                <div>
                  <label htmlFor="school-city" className="text-sm font-semibold text-slate-700">
                    City <span className="font-normal text-slate-500">(optional)</span>
                  </label>
                  <input
                    id="school-city"
                    maxLength={100}
                    autoComplete="address-level2"
                    value={form.city}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, city: event.target.value }))
                    }
                    className="mt-2 w-full rounded-lg border border-slate-300 px-4 py-3 text-sm focus:border-navy-500 focus:outline-none focus:ring-2 focus:ring-navy-200"
                  />
                </div>
              </div>
              <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" disabled={busy} onClick={closeForm}>
                  Cancel
                </Button>
                <Button type="submit" loading={busy}>
                  {editingSchool ? 'Save changes' : 'Add school'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {loading && (
          <DataState title="Loading schools" message="Fetching your tenant school directory." />
        )}
        {!loading && schools.length === 0 && (
          <DataState
            title="No schools added"
            message={
              canManage
                ? 'Add the first school when your tenant is ready.'
                : 'Your tenant administrator has not added a school.'
            }
          />
        )}

        {!loading && sortedSchools.length > 0 && (
          <section aria-label="School directory" className="grid gap-4">
            {sortedSchools.map((school) => (
              <Card key={school.id} className="p-5">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      <h2 className="break-words text-lg font-bold text-navy-900">{school.name}</h2>
                      <StatusPill tone={statusTone(school.status)}>
                        {school.status === 'archived' ? 'deleted' : school.status}
                      </StatusPill>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">
                      {school.city ? `${school.city}, Alberta` : 'Alberta'}
                    </p>
                  </div>

                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                      {school.status === 'archived' ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          leftIcon={<RotateCcw className="h-4 w-4" />}
                          onClick={() => void restoreSchool(school)}
                        >
                          Restore
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            leftIcon={<Pencil className="h-4 w-4" />}
                            onClick={() => openEditForm(school)}
                          >
                            Edit
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            leftIcon={<Trash2 className="h-4 w-4" />}
                            onClick={() => setDeleteTarget(school)}
                          >
                            Delete
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </section>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete school?"
        description={
          <>
            <strong>{deleteTarget?.name}</strong> will be removed from the active school directory.
            Transportation records and access will remain unchanged.
          </>
        }
        confirmLabel="Delete school"
        destructive
        busy={busy}
        onConfirm={() => void deleteSchool()}
        onCancel={() => setDeleteTarget(null)}
      />
    </DashboardLayout>
  );
}

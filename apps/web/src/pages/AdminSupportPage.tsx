import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout, adminNavGroups } from '@/components/layout/DashboardLayout';
import { AdminSettingsNav } from '@/components/settings/AdminSettingsNav';
import { SupportContactCard } from '@/components/support/SupportContactCard';
import { SupportContactForm } from '@/components/support/SupportContactForm';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  fetchSupportDirectory,
  updateTenantSupportContact,
  type SupportDirectory,
} from '@/services/supportDirectoryService';

export function AdminSupportPage() {
  const [directory, setDirectory] = useState<SupportDirectory>({ platform: null, tenant: null });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setDirectory(await fetchSupportDirectory());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to load support details.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
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
          title="Support"
          description="Contact the BusSafe platform administrator and manage the contact details shown to your drivers and guardians."
        />
        <AdminSettingsNav role="tenant_admin" />
        {message && (
          <Card className="border-success-200 bg-success-50 p-4">
            <p role="status" className="text-sm font-semibold text-success-700">
              {message}
            </p>
          </Card>
        )}
        {error && (
          <Card className="border-danger-200 bg-danger-50 p-4">
            <p role="alert" className="text-sm font-semibold text-danger-700">
              {error}
            </p>
          </Card>
        )}
        {loading ? (
          <DataState
            title="Loading support details"
            message="Checking verified support contacts."
          />
        ) : (
          <>
            {directory.platform ? (
              <SupportContactCard
                title="Contact the platform administrator"
                contact={directory.platform}
              />
            ) : (
              <DataState
                title="Platform support is not configured yet"
                message="A platform administrator must publish the support contact."
              />
            )}
            <SupportContactForm
              title="Contact details shown to drivers and guardians"
              contact={directory.tenant}
              saving={saving}
              onSave={async (input) => {
                setSaving(true);
                setError(null);
                setMessage(null);
                try {
                  await updateTenantSupportContact(input);
                  setMessage('Contact details updated for drivers and guardians.');
                  await load();
                } catch (cause) {
                  setError(
                    cause instanceof Error ? cause.message : 'Unable to save contact details.',
                  );
                } finally {
                  setSaving(false);
                }
              }}
            />
          </>
        )}
      </div>
    </DashboardLayout>
  );
}

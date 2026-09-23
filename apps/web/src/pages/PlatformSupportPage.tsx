import { useCallback, useEffect, useState } from 'react';
import { DashboardLayout, platformNavItems } from '@/components/layout/DashboardLayout';
import { SupportContactForm } from '@/components/support/SupportContactForm';
import { Card } from '@/components/ui/Card';
import { DataState } from '@/components/ui/DataState';
import { PageHeader } from '@/components/ui/PageHeader';
import {
  fetchSupportDirectory,
  updatePlatformSupportContact,
  type SupportContact,
} from '@/services/supportDirectoryService';

export function PlatformSupportPage() {
  const [contact, setContact] = useState<SupportContact | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setContact((await fetchSupportDirectory()).platform);
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
    <DashboardLayout title="Platform Admin" portal="admin" navItems={platformNavItems}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Platform administration"
          title="Support system"
          description="Manage the platform administrator contact shown to tenant administrators."
        />
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
            message="Checking the current platform contact."
          />
        ) : (
          <SupportContactForm
            title="Contact details for tenant administrators"
            contact={contact}
            saving={saving}
            onSave={async (input) => {
              setSaving(true);
              setError(null);
              setMessage(null);
              try {
                await updatePlatformSupportContact(input);
                setMessage('Platform support details updated for tenant administrators.');
                await load();
              } catch (cause) {
                setError(
                  cause instanceof Error ? cause.message : 'Unable to save support details.',
                );
              } finally {
                setSaving(false);
              }
            }}
          />
        )}
      </div>
    </DashboardLayout>
  );
}

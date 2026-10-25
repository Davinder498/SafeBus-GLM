import { Link } from 'react-router';
import { Card } from '@/components/ui/Card';
import { useAuth } from '@/contexts/useAuth';

export function MfaSettingsCard() {
  const { mfaStatus, mfaLoading } = useAuth();
  const enabled = mfaStatus.verifiedFactors.length > 0;

  return (
    <Card className="p-5" data-ui="account-security-card">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-950">Multi-factor authentication</h2>
          <p className="mt-1 text-sm text-slate-600" role="status">
            {mfaLoading ? 'Checking' : enabled ? 'On' : 'Off'}
          </p>
        </div>
        {!mfaLoading && (
          <Link
            to="/account/security"
            className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg border border-slate-200 px-4 text-sm font-semibold text-navy-700 hover:bg-slate-50"
          >
            {enabled ? 'Manage MFA' : 'Enable MFA'}
          </Link>
        )}
      </div>
    </Card>
  );
}

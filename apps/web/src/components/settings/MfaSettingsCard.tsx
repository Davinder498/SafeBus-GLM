import { Link, useNavigate } from 'react-router';
import { Card } from '@/components/ui/Card';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { adminRoles } from '@/contexts/AuthContext';
import { useAuth } from '@/contexts/useAuth';

export function MfaSettingsCard() {
  const { profile, mfaStatus, mfaLoading } = useAuth();
  const navigate = useNavigate();
  const enabled = mfaStatus.verifiedFactors.length > 0;
  const required = !!profile && adminRoles.some((role) => role === profile.role);

  return (
    <Card className="relative p-5" data-ui="account-security-card">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="font-bold text-slate-950">
            <Link
              to="/account/security"
              aria-label={enabled ? 'Manage MFA' : 'Enable MFA'}
              className="after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-navy-600"
            >
              Multi-factor authentication
            </Link>
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            {mfaLoading ? 'Checking' : required ? 'Required' : enabled ? 'On' : 'Off'}
          </p>
        </div>
        <div className="relative">
          <ToggleSwitch
            label="Multi-factor authentication"
            checked={enabled}
            disabled={mfaLoading || (required && enabled)}
            onChange={() =>
              navigate('/account/security', {
                state: { removeAuthenticator: enabled && !required },
              })
            }
          />
        </div>
      </div>
    </Card>
  );
}

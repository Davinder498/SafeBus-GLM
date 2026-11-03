import { Link } from 'react-router';
import { ChevronRight, ShieldCheck } from 'lucide-react';
import { Card } from '@/components/ui/Card';

/** Shared, role-neutral entry point. MFA management lives inside Account security. */
export function AccountSecurityLinkCard() {
  return (
    <Card className="relative p-5" data-ui="account-security-card">
      <Link
        to="/account/security"
        className="group flex min-h-11 items-center justify-between gap-3 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500"
      >
        <span className="flex min-w-0 items-start gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-navy-700" aria-hidden />
          <span>
            <span className="block font-bold text-navy-900">Account security</span>
            <span className="mt-1 block text-sm text-slate-600">
              Change your password and manage multi-factor authentication.
            </span>
          </span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-500 group-hover:text-navy-700" aria-hidden />
      </Link>
    </Card>
  );
}

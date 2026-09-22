import { Building2, CircleHelp, CreditCard, School } from 'lucide-react';
import { NavLink, type NavLinkRenderProps } from 'react-router';
import type { ProfileRole } from '@/contexts/AuthContext';
import { cn } from '@/utils/cn';

interface AdminSettingsNavProps {
  role: ProfileRole | null | undefined;
}

const settingsItems = [
  {
    label: 'Support',
    description: 'Platform and user help contacts',
    to: '/admin/settings/support',
    end: false,
    icon: CircleHelp,
    allowedRoles: ['tenant_admin', 'school_admin', 'transportation_admin'],
  },
  {
    label: 'Organization',
    description: 'Account and organization context',
    to: '/admin/settings',
    end: true,
    icon: Building2,
    allowedRoles: ['tenant_admin', 'school_admin', 'transportation_admin'],
  },
  {
    label: 'Schools',
    description: 'Tenant school directory',
    to: '/admin/settings/schools',
    end: false,
    icon: School,
    allowedRoles: ['tenant_admin', 'school_admin', 'transportation_admin'],
  },
  {
    label: 'Subscription & billing',
    description: 'Contract, usage, and invoices',
    to: '/admin/settings/billing',
    end: false,
    icon: CreditCard,
    allowedRoles: ['tenant_admin'],
  },
] as const;

export function AdminSettingsNav({ role }: AdminSettingsNavProps) {
  const visibleItems = settingsItems.filter(
    (item) => role && (item.allowedRoles as readonly ProfileRole[]).includes(role),
  );

  return (
    <nav aria-label="Settings sections" className="overflow-x-auto border-b border-slate-200">
      <ul className="flex min-w-max gap-6">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }: NavLinkRenderProps) =>
                  cn(
                    'group flex min-w-0 items-start gap-3 border-b-2 px-1 pb-3 pt-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2',
                    isActive
                      ? 'border-navy-600 text-navy-800'
                      : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
                  )
                }
              >
                <Icon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
                <span>
                  <span className="block text-sm font-bold">{item.label}</span>
                  <span className="mt-0.5 hidden text-xs font-medium text-slate-500 sm:block">
                    {item.description}
                  </span>
                </span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

import { Bell, Building2, CircleHelp, CreditCard, School } from 'lucide-react';
import { NavLink, type NavLinkRenderProps } from 'react-router';
import type { ProfileRole } from '@/contexts/AuthContext';
import { cn } from '@/utils/cn';

interface AdminSettingsNavProps {
  role: ProfileRole | null | undefined;
}

const settingsItems = [
  {
    label: 'Support',
    to: '/admin/settings/support',
    end: false,
    icon: CircleHelp,
    allowedRoles: ['tenant_admin'],
  },
  {
    label: 'Organization',
    to: '/admin/settings',
    end: true,
    icon: Building2,
    allowedRoles: ['tenant_admin', 'school_admin', 'transportation_admin'],
  },
  {
    label: 'Schools',
    to: '/admin/settings/schools',
    end: false,
    icon: School,
    allowedRoles: ['tenant_admin', 'school_admin', 'transportation_admin'],
  },
  {
    label: 'Notifications',
    to: '/admin/settings/notifications',
    end: false,
    icon: Bell,
    allowedRoles: ['tenant_admin'],
  },
  {
    label: 'Subscription & billing',
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
    <nav aria-label="Settings sections" className="border-b border-slate-200">
      <ul className="flex flex-wrap gap-x-5 gap-y-1">
        {visibleItems.map((item) => {
          const Icon = item.icon;
          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className={({ isActive }: NavLinkRenderProps) =>
                  cn(
                    'group flex min-h-11 items-center gap-2 whitespace-nowrap border-b-2 px-1 py-2 text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-500 focus-visible:ring-offset-2',
                    isActive
                      ? 'border-navy-600 text-navy-800'
                      : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900',
                  )
                }
              >
                <Icon className="h-5 w-5 shrink-0" aria-hidden />
                <span>{item.label}</span>
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

import { Building2, CreditCard } from 'lucide-react';
import { NavLink, type NavLinkRenderProps } from 'react-router';
import { cn } from '@/utils/cn';

interface AdminSettingsNavProps {
  showBilling: boolean;
}

const settingsItems = [
  {
    label: 'Organization',
    description: 'Account and organization context',
    to: '/admin/settings',
    end: true,
    icon: Building2,
    billingOnly: false,
  },
  {
    label: 'Subscription & billing',
    description: 'Contract, usage, and invoices',
    to: '/admin/settings/billing',
    end: false,
    icon: CreditCard,
    billingOnly: true,
  },
] as const;

export function AdminSettingsNav({ showBilling }: AdminSettingsNavProps) {
  const visibleItems = settingsItems.filter((item) => !item.billingOnly || showBilling);

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

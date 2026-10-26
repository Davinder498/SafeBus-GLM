import { Moon, Sun } from 'lucide-react';
import { useAppearance } from '@/theme/useAppearance';
import { Card } from '@/components/ui/Card';

export function AppearanceToggle({ compact = false }: { compact?: boolean }) {
  const { resolved, setPreference } = useAppearance();
  const dark = resolved === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-label="Dark mode"
      aria-checked={dark}
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      className={`sb-appearance-toggle${compact ? ' sb-appearance-toggle--compact' : ''}`}
      onClick={() => setPreference(dark ? 'light' : 'dark')}
    >
      <span className="sb-appearance-toggle__track" aria-hidden>
        <span className="sb-appearance-toggle__thumb">
          {dark ? <Moon size={14} /> : <Sun size={14} />}
        </span>
      </span>
      <span className={compact ? 'hidden sm:inline' : ''}>{dark ? 'Dark' : 'Light'}</span>
    </button>
  );
}

export function AppearanceSettingsCard() {
  return (
    <Card className="p-5" data-ui="appearance-settings">
      <h2 className="mb-4 text-lg font-bold text-navy-900">Appearance</h2>
      <AppearanceToggle />
    </Card>
  );
}

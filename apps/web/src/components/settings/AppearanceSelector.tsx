import { useId } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useAppearance } from '@/theme/useAppearance';
import { normalizeThemePreference } from '@/theme/appearance';
import { Card } from '@/components/ui/Card';

export function AppearanceSelector({ compact = false }: { compact?: boolean }) {
  const id = useId();
  const { preference, resolved, setPreference } = useAppearance();
  const Icon = preference === 'system' ? Monitor : resolved === 'dark' ? Moon : Sun;
  return (
    <label
      htmlFor={id}
      className={`sb-appearance-selector${compact ? ' sb-appearance-selector--compact' : ''}`}
    >
      <Icon className="h-4 w-4 shrink-0" aria-hidden />
      <span className={compact ? 'sr-only' : ''}>Appearance</span>
      <select
        id={id}
        aria-label="Appearance"
        value={preference}
        onChange={(event) => setPreference(normalizeThemePreference(event.target.value))}
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}

export function AppearanceSettingsCard() {
  return (
    <Card className="p-5" data-ui="appearance-settings">
      <h2 className="mb-4 text-lg font-bold text-navy-900">Appearance</h2>
      <AppearanceSelector />
    </Card>
  );
}

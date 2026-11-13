import { Moon, Sun } from 'lucide-react';
import { useAppearance } from '@/theme/useAppearance';
import { Card } from '@/components/ui/Card';
import { useAppSurface } from '@/contexts/AppSurfaceContext';

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
  const surface = useAppSurface();
  const { preference, setPreference } = useAppearance();
  if (surface === 'native-mobile') return (
    <Card className="p-5" data-ui="appearance-settings">
      <fieldset>
        <legend className="text-lg font-bold text-navy-900">Appearance</legend>
        <div className="mt-3 flex flex-wrap gap-2">
          {(['system', 'light', 'dark'] as const).map((value) => (
            <label key={value} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2">
              <input type="radio" name="appearance" value={value} checked={preference === value}
                onChange={() => setPreference(value)} />
              {value === 'system' ? 'Follow phone settings' : value === 'light' ? 'Light' : 'Dark'}
            </label>
          ))}
        </div>
      </fieldset>
    </Card>
  );
  return (
    <Card className="flex items-center justify-between gap-4 p-5" data-ui="appearance-settings">
      <h2 className="text-lg font-bold text-navy-900">Appearance</h2>
      <AppearanceToggle />
    </Card>
  );
}

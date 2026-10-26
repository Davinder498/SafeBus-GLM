import { useSyncExternalStore } from 'react';
import { getAppearance, setThemePreference, subscribeAppearance } from './appearance';

export function useAppearance() {
  const appearance = useSyncExternalStore(subscribeAppearance, getAppearance);
  return { ...appearance, setPreference: setThemePreference };
}

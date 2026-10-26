export type ThemePreference = 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export interface Appearance {
  preference: ThemePreference;
  resolved: ResolvedTheme;
}

const storageKey = 'safebus.theme';
const listeners = new Set<() => void>();
let initialized = false;
let snapshot: Appearance = { preference: 'light', resolved: 'light' };

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === 'dark' ? 'dark' : 'light';
}

function apply(preference: ThemePreference) {
  const resolved = preference;
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  root.style.backgroundColor = resolved === 'dark' ? '#0F1720' : '#F2F6F7';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', resolved === 'dark' ? '#0F1720' : '#F2F6F7');
  if (snapshot.preference === preference && snapshot.resolved === resolved) return;
  snapshot = { preference, resolved };
  listeners.forEach((listener) => listener());
}

export function initializeAppearance() {
  if (initialized) return;
  initialized = true;
  let preference: ThemePreference = 'light';
  try {
    preference = normalizeThemePreference(localStorage.getItem(storageKey));
  } catch {
    /* Optional storage. */
  }
  apply(preference);
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) {
      apply(normalizeThemePreference(event.newValue));
    }
  });
  // Restore browser chrome when returning to the app.
  document.addEventListener('visibilitychange', refreshAppearance);
  window.addEventListener('pageshow', refreshAppearance);
}

export function refreshAppearance() {
  apply(snapshot.preference);
}

export function setThemePreference(preference: ThemePreference) {
  initializeAppearance();
  const normalized = normalizeThemePreference(preference);
  try {
    localStorage.setItem(storageKey, normalized);
  } catch {
    /* Still usable until the app closes. */
  }
  apply(normalized);
}

export function getAppearance(): Appearance {
  initializeAppearance();
  return snapshot;
}

export function subscribeAppearance(listener: () => void) {
  initializeAppearance();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

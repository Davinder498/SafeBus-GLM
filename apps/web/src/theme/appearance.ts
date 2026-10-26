export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';
export interface Appearance {
  preference: ThemePreference;
  resolved: ResolvedTheme;
}

const storageKey = 'safebus.theme';
const listeners = new Set<() => void>();
let media: MediaQueryList | undefined;
let initialized = false;
let nativeSystemDark: boolean | undefined;
let snapshot: Appearance = { preference: 'system', resolved: 'light' };

export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}

function apply(preference: ThemePreference) {
  const resolved =
    preference === 'system'
      ? (nativeSystemDark ?? media?.matches)
        ? 'dark'
        : 'light'
      : preference;
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
  media = window.matchMedia?.('(prefers-color-scheme: dark)');
  let preference: ThemePreference = 'system';
  try {
    preference = normalizeThemePreference(localStorage.getItem(storageKey));
  } catch {
    /* Optional storage. */
  }
  apply(preference);
  media?.addEventListener('change', () => apply(snapshot.preference));
  window.addEventListener('storage', (event) => {
    if (event.key === storageKey || event.key === null) {
      apply(normalizeThemePreference(event.newValue));
    }
  });
  // Some Android WebViews do not deliver matchMedia changes while suspended.
  document.addEventListener('visibilitychange', refreshAppearance);
  window.addEventListener('pageshow', refreshAppearance);
}

export function refreshAppearance() {
  media = window.matchMedia?.('(prefers-color-scheme: dark)');
  apply(snapshot.preference);
}

/** Android supplies the device setting independently of its app-local theme. */
export function setNativeSystemTheme(dark: boolean) {
  nativeSystemDark = dark;
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

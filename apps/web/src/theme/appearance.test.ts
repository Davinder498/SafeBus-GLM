import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAppearance,
  initializeAppearance,
  normalizeThemePreference,
  refreshAppearance,
  setThemePreference,
  subscribeAppearance,
} from './appearance';

let matches = false;
const mediaListeners = new Set<() => void>();
function systemDark(dark: boolean) {
  matches = dark;
  mediaListeners.forEach((listener) => listener());
}

beforeAll(() => {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return matches;
      },
      addEventListener: (_event: string, listener: () => void) => mediaListeners.add(listener),
    })),
  );
  document.head.innerHTML = '<meta name="theme-color" content="#F2F6F7">';
  initializeAppearance();
});
beforeEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  systemDark(false);
  setThemePreference('light');
});

describe('device appearance preference', () => {
  it('migrates removed System and invalid choices to Light', () => {
    expect(normalizeThemePreference('system')).toBe('light');
    expect(normalizeThemePreference(null)).toBe('light');
    expect(normalizeThemePreference('invalid')).toBe('light');
    expect(normalizeThemePreference('dark')).toBe('dark');
  });
  it('changes the selected theme and browser chrome', () => {
    expect(getAppearance()).toEqual({ preference: 'light', resolved: 'light' });
    setThemePreference('dark');
    expect(getAppearance()).toEqual({ preference: 'dark', resolved: 'dark' });
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#172b3a',
    );
  });

  it('persists each binary choice and ignores device changes', () => {
    setThemePreference('light');
    systemDark(true);
    expect(getAppearance().resolved).toBe('light');
    expect(localStorage.getItem('safebus.theme')).toBe('light');
    setThemePreference('dark');
    systemDark(false);
    refreshAppearance();
    expect(getAppearance().resolved).toBe('dark');
    expect(localStorage.getItem('safebus.theme')).toBe('dark');
  });

  it('accepts cross-tab changes, reset and invalid stored values without writing them back', () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    window.dispatchEvent(new StorageEvent('storage', { key: 'safebus.theme', newValue: 'dark' }));
    expect(getAppearance().resolved).toBe('dark');
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', newValue: 'light' }));
    expect(getAppearance().resolved).toBe('dark');
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'safebus.theme', newValue: 'invalid' }),
    );
    expect(getAppearance().preference).toBe('light');
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(getAppearance().resolved).toBe('light');
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it('still changes appearance when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => setThemePreference('dark')).not.toThrow();
    expect(getAppearance().resolved).toBe('dark');
  });

  it('notifies subscribers only when state changes and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeAppearance(listener);
    setThemePreference('dark');
    refreshAppearance();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    setThemePreference('light');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

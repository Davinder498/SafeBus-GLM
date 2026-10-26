import {
  Capacitor,
  registerPlugin,
  SystemBars,
  SystemBarsStyle,
  type PluginListenerHandle,
} from '@capacitor/core';
import {
  getAppearance,
  initializeAppearance,
  normalizeThemePreference,
  refreshAppearance,
  setThemePreference,
  subscribeAppearance,
  type ThemePreference,
} from '@/theme/appearance';

interface NativeAppearanceState {
  preference: ThemePreference | null;
}
interface NativeAppearancePlugin {
  getPreference(): Promise<NativeAppearanceState>;
  setPreference(options: { preference: ThemePreference }): Promise<void>;
  addListener(
    event: 'systemThemeChanged',
    listener: (state: NativeAppearanceState) => void,
  ): Promise<PluginListenerHandle>;
}
const native = registerPlugin<NativeAppearancePlugin>('SafeBusAppearance');

export async function installNativeAppearance(): Promise<void> {
  initializeAppearance();
  if (!Capacitor.isNativePlatform()) return;
  try {
    const saved = await native.getPreference();
    // On upgrade, adopt the browser preference once; thereafter native storage
    // also survives a WebView storage failure and controls the startup window.
    if (saved.preference !== null) setThemePreference(normalizeThemePreference(saved.preference));
    await native.addListener('systemThemeChanged', refreshAppearance);
    let pending = Promise.resolve();
    const synchronize = () => {
      const { preference } = getAppearance();
      pending = pending
        .catch(() => undefined)
        .then(async () => {
          await native.setPreference({ preference });
          await SystemBars.setStyle({
            style: SystemBarsStyle.Dark,
          });
        });
      // The CSS theme remains usable even if an older installed native wrapper
      // does not yet contain the new bridge.
      void pending.catch(() => undefined);
    };
    subscribeAppearance(synchronize);
    synchronize();
    await pending;
  } catch {
    /* Native bridge absent in a browser preview or older wrapper. */
  }
}

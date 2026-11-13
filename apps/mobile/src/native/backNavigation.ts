import { App } from '@capacitor/app';

export interface BackState {
  pathname: string;
  home: string;
  historyIndex: number;
}

export function backDestination({ pathname, home, historyIndex }: BackState): 'system' | 'history' | string {
  // Top-level home and sign-in should hand Back to Android, including its preview.
  if (pathname === home || pathname === '/login' || pathname === '/') return 'system';
  if (historyIndex > 0) return 'history';
  return home;
}

function overlay(): Element | null {
  return document.querySelector('dialog[open], [role="dialog"][aria-modal="true"], [role="menu"]');
}

export async function installBackNavigation(
  state: () => BackState,
  navigate: (destination: number | string) => void,
) {
  let disposed = false;
  let queue = Promise.resolve();
  let enabled: boolean | undefined;
  const refresh = () => {
    queue = queue.catch(() => undefined).then(async () => {
      if (disposed) return;
      const nextEnabled = !!overlay() || backDestination(state()) !== 'system';
      // Map/status updates also mutate the DOM; cross the native bridge only
      // when ownership of Back actually changes.
      if (nextEnabled === enabled) return;
      await App.toggleBackButtonHandler({ enabled: nextEnabled });
      enabled = nextEnabled;
    });
    void queue.catch(() => undefined);
  };
  const listener = await App.addListener('backButton', () => {
    const activeOverlay = overlay();
    if (activeOverlay) {
      if (activeOverlay instanceof HTMLDialogElement) {
        // Run the same cancellation path as Escape; busy dialogs can veto it.
        const allowed = activeOverlay.dispatchEvent(new Event('cancel', { cancelable: true }));
        if (allowed) activeOverlay.close();
      } else {
        const target = activeOverlay.contains(document.activeElement) ? document.activeElement! : activeOverlay;
        target.dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }),
        );
      }
      refresh();
      return;
    }
    const destination = backDestination(state());
    if (destination === 'system') {
      // A queued event can arrive just before the native callback is disabled.
      void App.minimizeApp();
    } else navigate(destination === 'history' ? -1 : destination);
    refresh();
  });
  const observer = new MutationObserver(refresh);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true,
    attributeFilter: ['open', 'aria-modal', 'role'] });
  refresh();
  return {
    refresh,
    async dispose() {
      disposed = true;
      observer.disconnect();
      await listener.remove();
      await queue.catch(() => undefined);
      await App.toggleBackButtonHandler({ enabled: false });
    },
  };
}

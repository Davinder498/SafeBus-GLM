// Runs synchronously in <head>, before styles or React can paint a light frame.
(() => {
  const native = document.documentElement.dataset.appSurface === 'native-mobile';
  let preference = native ? 'system' : 'light';
  try {
    const saved = localStorage.getItem('safebus.theme');
    if (saved === 'light' || saved === 'dark' || saved === 'system') preference = saved;
  } catch {
    /* A blocked storage area must not prevent the app from starting. */
  }
  const dark =
    (native || document.documentElement.dataset.appearanceScope !== 'public') &&
    (preference === 'dark' || (preference === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches));
  const theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = dark ? '#0F1720' : '#F5F7FA';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0F1720' : '#F5F7FA');
})();

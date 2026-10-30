// Runs synchronously in <head>, before styles or React can paint a light frame.
(() => {
  let preference = 'light';
  try {
    const saved = localStorage.getItem('safebus.theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch {
    /* A blocked storage area must not prevent the app from starting. */
  }
  const dark =
    document.documentElement.dataset.appearanceScope !== 'public' && preference === 'dark';
  const theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  document.documentElement.style.backgroundColor = dark ? '#0F1720' : '#F2F6F7';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#0F1720' : '#F2F6F7');
})();

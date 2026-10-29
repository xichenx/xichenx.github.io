(() => {
  let stored;
  try { stored = localStorage.getItem('morii-theme') || localStorage.getItem('mingzhi-theme'); } catch { /* Storage may be unavailable. */ }
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = stored === 'dark' || stored === 'light' ? stored : dark ? 'dark' : 'light';
})();

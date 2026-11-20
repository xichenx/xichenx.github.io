(() => {
  let stored;
  try { stored = localStorage.getItem('morii-theme') || localStorage.getItem('mingzhi-theme'); } catch { /* Storage may be unavailable. */ }
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = stored === 'dark' || stored === 'light' ? stored : dark ? 'dark' : 'light';
})();

// Diagnostics are opt-in and stay in the current browser.
(() => {
  const script = document.currentScript;
  if (script?.dataset.diagnostics !== 'on' && new URLSearchParams(location.search).get('morii-debug') !== '1') return;
  if (!script?.dataset.diagnosticsSrc) return;
  const diagnostics = document.createElement('script');
  diagnostics.src = script.dataset.diagnosticsSrc;
  diagnostics.async = true;
  document.head.append(diagnostics);
})();

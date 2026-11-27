(() => {
  let stored;
  try { stored = localStorage.getItem('morii-theme') || localStorage.getItem('mingzhi-theme'); } catch { /* Storage may be unavailable. */ }
  const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
  const root = document.documentElement;
  root.dataset.theme = stored === 'dark' || stored === 'light' ? stored : dark ? 'dark' : 'light';
  const chrome = document.querySelector('meta[name="theme-color"]');
  if (chrome && !chrome.dataset.inverse) chrome.content = chrome.dataset[root.dataset.theme];
  if (document.currentScript?.hasAttribute('data-promo-ink') && root.dataset.motion === 'on' &&
      typeof IntersectionObserver === 'function' && typeof Element.prototype.animate === 'function' &&
      typeof CSS !== 'undefined' && (CSS.supports('mask-image', 'url("#morii-promo-ink")') || CSS.supports('-webkit-mask-image', 'url("#morii-promo-ink")')) &&
      typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: no-preference) and (forced-colors: none)').matches) {
    root.dataset.promoInk = 'pending';
    setTimeout(() => {
      if (root.dataset.promoInk === 'pending') delete root.dataset.promoInk;
    }, 1500);
  }
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

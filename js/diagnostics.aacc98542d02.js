(() => {
  if (window.MoriiDiagnostics) return;
  const failures = [];
  const navigation = [];
  const metrics = {};
  const observers = [];
  const cleanURL = value => { try { const url = new URL(value, location.href); return url.origin + url.pathname; } catch { return ''; } };
  const classify = entry => /\.(?:png|jpe?g|webp|gif|svg|avif)(?:\?|$)/i.test(entry.name) ? 'image' : entry.initiatorType === 'fetch' || entry.initiatorType === 'xmlhttprequest' ? 'api' : entry.initiatorType;
  if (typeof PerformanceObserver === 'function') {
    for (const [type, accept] of [
      ['largest-contentful-paint', entry => { metrics.lcp = entry.startTime; }],
      ['layout-shift', entry => { if (!entry.hadRecentInput) metrics.cls = (metrics.cls || 0) + entry.value; }]
    ]) {
      try { const observer = new PerformanceObserver(list => list.getEntries().forEach(accept)); observer.observe({ type, buffered: true }); observers.push(observer); } catch { /* Unsupported metric. */ }
    }
  }
  document.addEventListener('error', event => {
    const url = event.target?.src || event.target?.href;
    if (url) { failures.push({ type: 'resource', url: cleanURL(url) }); if (failures.length > 30) failures.shift(); }
  }, true);
  window.addEventListener('morii:navigation', event => {
    navigation.push({ url: cleanURL(event.detail?.url), status: event.detail?.status, duration: event.detail?.duration });
    if (navigation.length > 20) navigation.shift();
  });
  const report = () => {
    const nav = performance.getEntriesByType('navigation')[0];
    const resources = performance.getEntriesByType('resource').map(entry => ({ url: cleanURL(entry.name), type: classify(entry), duration: Math.round(entry.duration), bytes: entry.transferSize || null, cached: entry.transferSize === 0 && entry.decodedBodySize > 0, timingRestricted: entry.responseStart === 0 && new URL(entry.name, location.href).origin !== location.origin })).sort((a, b) => b.duration - a.duration).slice(0, 20);
    return { page: cleanURL(location.href), metrics: { ttfb: nav ? Math.round(nav.responseStart - nav.startTime) : null, domReady: nav ? Math.round(nav.domContentLoadedEventEnd) : null, fcp: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null, ...metrics }, resources, failures: [...failures], navigation: [...navigation] };
  };
  window.MoriiDiagnostics = {
    report,
    download() {
      const url = URL.createObjectURL(new Blob([JSON.stringify(report(), null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'morii-diagnostics.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  };
  window.addEventListener('pagehide', () => observers.forEach(observer => observer.disconnect()), { once: true });
  console.info('[Morii] Diagnostics enabled. MoriiDiagnostics.report() / .download(); data stays in this browser.');
})();

(() => {
  const root = document.documentElement;
  const main = document.getElementById('main');
  if (!main) return;
  const preference = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const selector = '.hero__main, .hero-mini, .section-heading, .feature-card, .post-card, .profile-card, .side-card, .discovery-card, .selected-card, .friend-card, .feed-card, .photo-card, .taxonomy-card, .related-card, .archive-tree-item, .page-intro:not(.music-page-heading), .article-header';
  const seen = new WeakSet();
  const active = new Map();
  let observed = new WeakSet();
  let reveals;
  let ambient;
  let changes;
  let stopped = false;
  const cancel = element => { active.get(element)?.cancel(); active.delete(element); };
  const stop = () => {
    reveals?.disconnect(); ambient?.disconnect(); changes?.disconnect();
    reveals = ambient = changes = undefined;
    for (const element of active.keys()) cancel(element);
    observed = new WeakSet();
    main.querySelectorAll('.hero__main').forEach(element => element.style.setProperty('--morii-ambient-state', 'paused'));
  };
  const register = node => {
    if (!reveals || stopped || preference?.matches || root.dataset.motion === 'off' || node.nodeType !== 1) return;
    const elements = [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)];
    elements.forEach(element => {
      if (!seen.has(element) && !observed.has(element)) { observed.add(element); reveals.observe(element); }
    });
  };
  const start = () => {
    if (stopped || root.dataset.motion === 'off' || preference?.matches || reveals || typeof IntersectionObserver !== 'function' || typeof Element.prototype.animate !== 'function') return;
    reveals = new IntersectionObserver(entries => {
      if (!reveals || stopped || preference?.matches || root.dataset.motion === 'off') return;
      let order = 0;
      entries.forEach(entry => {
        const element = entry.target;
        if (document.hidden || !entry.isIntersecting || element.hidden || !element.getClientRects().length) return;
        reveals.unobserve(element);
        if (seen.has(element)) return;
        seen.add(element);
        // Elements remain visible in CSS; cancelling or missing browser support never hides content.
        try {
          const animation = element.animate([
            { opacity: 0, translate: '0 18px' },
            { opacity: 1, translate: '0 0' }
          ], { duration: 560, delay: Math.min(order++, 4) * 65, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'backwards' });
          active.set(element, animation);
          animation.finished.then(() => { if (active.get(element) === animation) active.delete(element); }).catch(() => {});
        } catch { /* Keep the normal, visible page if animation is unavailable. */ }
      });
    }, { threshold: .06 });
    ambient = new IntersectionObserver(entries => entries.forEach(entry => {
      entry.target.style.setProperty('--morii-ambient-state', entry.isIntersecting ? 'running' : 'paused');
    }));
    main.querySelectorAll('.hero__main').forEach(element => ambient.observe(element));
    register(main);
    if (typeof MutationObserver === 'function') {
      changes = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(register)));
      changes.observe(main, { childList: true, subtree: true });
    }
  };
  const visibility = () => {
    root.toggleAttribute('data-motion-paused', document.hidden);
    if (document.hidden) for (const element of active.keys()) cancel(element);
  };
  // Keyboard users never wait for an entry animation to finish before seeing a focused control.
  main.addEventListener('focusin', event => {
    for (const element of active.keys()) if (element.contains(event.target)) cancel(element);
  });
  preference?.addEventListener('change', () => { stop(); start(); });
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', () => { stopped = true; stop(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { stopped = false; visibility(); start(); } });
  document.addEventListener('beforeprint', stop);
  window.addEventListener('beforeprint', stop);
  window.addEventListener('afterprint', start);
  visibility(); start();
})();

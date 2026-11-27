(() => {
  const root = document.documentElement;
  const main = document.getElementById('main');
  if (!main) return;
  const home = Boolean(main.querySelector('.hero__main'));
  const promo = main.querySelector('.theme-promo');
  const wordmark = promo?.querySelector('h2');
  const inkEnd = promo?.querySelector('[data-ink-end]');
  let writingObserver;
  const finishWriting = () => {
    writingObserver?.disconnect();
    writingObserver = undefined;
    if (root.dataset.promoInk) delete root.dataset.promoInk;
    promo?.removeAttribute('data-writing');
  };
  inkEnd?.addEventListener('animationend', finishWriting);
  inkEnd?.addEventListener('animationcancel', finishWriting);
  const preference = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  const desktopHome = home && typeof matchMedia === 'function'
    ? matchMedia('(min-width: 801px) and (hover: hover) and (pointer: fine)') : null;
  const startWriting = () => {
    if (root.dataset.promoInk !== 'pending') return;
    if (!inkEnd || preference?.matches || document.hidden || promo.contains(document.activeElement)) {
      finishWriting();
      return;
    }
    root.dataset.promoInk = 'ready';
    writingObserver = new IntersectionObserver(([entry]) => {
      if (root.dataset.promoInk !== 'ready' || entry.intersectionRatio < .35) return;
      writingObserver.disconnect();
      writingObserver = undefined;
      root.dataset.promoInk = 'writing';
      promo.setAttribute('data-writing', '');
    }, { threshold: .35 });
    writingObserver.observe(wordmark);
  };
  const selector = '.hero__main, .hero-mini, .section-heading, .feature-card, .post-card, .profile-card, .side-card, .discovery-card, .selected-card, .friend-card, .feed-card, .photo-card, .taxonomy-card, .related-card, .archive-tree-item, .page-intro, .article-header';
  const seen = new WeakSet();
  const ambientSelector = '.hero__main';
  let ambientObserved = new WeakSet();
  const active = new Map();
  let observed = new WeakSet();
  let reveals;
  let ambient;
  let changes;
  let stopped = false;
  const easing = 'cubic-bezier(.22, 1, .36, 1)';
  const cancel = element => { active.get(element)?.cancel(); active.delete(element); };
  const play = (element, frames, delay = 0, duration = 500) => {
    // Focus and hover stay responsive: translate does not replace the card's transform.
    if (element.contains(document.activeElement)) return;
    try {
      const animation = element.animate(frames, { duration, delay, easing, fill: 'backwards' });
      active.set(element, animation);
      animation.finished.then(() => { if (active.get(element) === animation) active.delete(element); }).catch(() => {});
    } catch { /* Keep the normal, visible page if animation is unavailable. */ }
  };
  const stop = (finishInk = true) => {
    if (finishInk) finishWriting();
    reveals?.disconnect(); ambient?.disconnect(); changes?.disconnect();
    reveals = ambient = changes = undefined;
    for (const element of active.keys()) cancel(element);
    observed = new WeakSet();
    ambientObserved = new WeakSet();
    main.querySelectorAll(ambientSelector).forEach(element => element.style.setProperty('--morii-ambient-state', 'paused'));
  };
  const register = node => {
    if (!reveals || stopped || preference?.matches || root.dataset.motion === 'off' || node.nodeType !== 1) return;
    const elements = [...(node.matches(selector) ? [node] : []), ...node.querySelectorAll(selector)];
    elements.forEach(element => {
      // A nested card travels with its parent; a second reveal would double the movement.
      const parent = element.parentElement?.closest(selector);
      if ((!parent || !main.contains(parent)) && !seen.has(element) && !observed.has(element)) { observed.add(element); reveals.observe(element); }
      if (ambient && element.matches(ambientSelector) && !ambientObserved.has(element)) { ambientObserved.add(element); ambient.observe(element); }
    });
  };
  const start = () => {
    if (stopped || root.dataset.motion === 'off' || preference?.matches || desktopHome?.matches === false || reveals || typeof IntersectionObserver !== 'function' || typeof Element.prototype.animate !== 'function') return;
    reveals = new IntersectionObserver(entries => {
      if (!reveals || stopped || preference?.matches || root.dataset.motion === 'off') return;
      const groups = new Map();
      entries.forEach(entry => {
        const element = entry.target;
        if (document.hidden || !entry.isIntersecting || element.hidden || !element.getClientRects().length) return;
        reveals.unobserve(element);
        if (seen.has(element)) return;
        seen.add(element);
        if (element.matches('.hero__main')) {
          // Keep the large hero and title painted from the first frame (including LCP).
          [...element.children].filter(child => child.matches('.eyebrow, h1, p, .hero__actions')).forEach((child, index) => {
            play(child, [{ translate: '0 9px' }, { translate: '0 0' }], index * 45, 560);
          });
          return;
        }
        const order = groups.get(element.parentElement) || 0;
        groups.set(element.parentElement, order + 1);
        // Stagger siblings, not unrelated sections; no baseline CSS hides content.
        const heroCard = element.matches('.hero-mini');
        play(element, [{ opacity: heroCard ? .7 : .25, translate: heroCard ? '0 10px' : '0 14px' }, { opacity: 1, translate: '0 0' }], Math.min(order, 3) * 55);
      });
    }, { threshold: .06 });
    ambient = new IntersectionObserver(entries => entries.forEach(entry => {
      entry.target.style.setProperty('--morii-ambient-state', entry.isIntersecting ? 'running' : 'paused');
    }));
    register(main);
    if (typeof MutationObserver === 'function') {
      changes = new MutationObserver(records => records.forEach(record => record.addedNodes.forEach(register)));
      changes.observe(main, { childList: true, subtree: true });
    }
  };
  const visibility = () => {
    root.toggleAttribute('data-motion-paused', document.hidden);
    if (document.hidden) {
      finishWriting();
      for (const element of active.keys()) cancel(element);
    }
  };
  // Keyboard users never wait for an entry animation to finish before seeing a focused control.
  main.addEventListener('focusin', event => {
    if (promo?.contains(event.target)) finishWriting();
    for (const element of active.keys()) if (element.contains(event.target)) cancel(element);
  });
  preference?.addEventListener('change', () => { stop(); start(); });
  desktopHome?.addEventListener('change', () => { stop(false); start(); });
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('pagehide', () => { stopped = true; stop(); });
  window.addEventListener('pageshow', event => { if (event.persisted) { stopped = false; visibility(); start(); } });
  document.addEventListener('beforeprint', stop);
  window.addEventListener('beforeprint', stop);
  window.addEventListener('afterprint', start);
  visibility(); start(); startWriting();
})();

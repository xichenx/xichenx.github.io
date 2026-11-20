(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  document.querySelectorAll('[data-moments]').forEach(card => {
    const items = [...card.querySelectorAll('.moment-item')];
    const controls = card.querySelector('[data-moment-controls]');
    if (!items.length || !controls) return;
    let current = 0;
    controls.hidden = false;
    const show = direction => {
      current = (current + direction + items.length) % items.length;
      items.forEach((item, index) => { item.hidden = index !== current; });
      card.querySelector('[data-moment-count]').textContent = `${current + 1} / ${items.length}`;
    };
    card.querySelector('[data-moment-prev]')?.addEventListener('click', () => show(-1));
    card.querySelector('[data-moment-next]')?.addEventListener('click', () => show(1));
  });
  document.querySelectorAll('[data-random]').forEach(card => {
    const pool = [...(card.querySelector('[data-random-pool]')?.content.querySelectorAll('a') || [])].map(item => ({
      href: new URL(item.getAttribute('href'), document.baseURI).href,
      title: item.dataset.title,
      summary: item.dataset.summary
    }));
    const link = card.querySelector('[data-random-link]');
    const button = card.querySelector('[data-random-refresh]');
    if (!link || pool.length < 2 || !button) return;
    const title = link.querySelector('[data-random-title]');
    const summary = link.querySelector('[data-random-summary]');
    const status = card.querySelector('[data-random-status]');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const motionAllowed = () => !motion.matches && document.documentElement.dataset.motion !== 'off';
    button.parentElement.hidden = false;
    button.hidden = false;
    let remaining = [];
    let visible = false;
    let hovered = window.matchMedia('(hover: hover)').matches && card.matches(':hover');
    let activePage = true;
    let timer;
    let finish;

    const advance = manual => {
      if (!remaining.length) remaining = pool.filter(item => item.href !== link.href);
      const [selected] = remaining.splice(Math.floor(Math.random() * remaining.length), 1);
      if (!selected) return;
      finish?.();
      if (motionAllowed() && typeof link.animate === 'function') {
        const previous = document.createElement('div');
        previous.className = 'random-result random-result--outgoing';
        previous.setAttribute('aria-hidden', 'true');
        previous.append(...[...link.children].map(child => child.cloneNode(true)));
        link.before(previous);
        const outgoing = previous.animate(
          [{ transform: 'translateX(0)', opacity: 1 }, { transform: 'translateX(-14px)', opacity: 0 }],
          { duration: 140, easing: 'ease-out', fill: 'forwards' }
        );
        const incoming = link.animate(
          [{ transform: 'translateX(18px)', opacity: 0 }, { transform: 'translateX(0)', opacity: 1 }],
          { duration: 240, delay: 60, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'backwards' }
        );
        const cleanup = () => {
          previous.remove();
          outgoing.cancel();
          incoming.cancel();
          if (finish === cleanup) finish = null;
        };
        finish = cleanup;
        incoming.finished.then(cleanup, () => {});
      }
      link.href = selected.href;
      title.textContent = selected.title;
      summary.textContent = selected.summary;
      if (manual) status.textContent = t("为你找到：{0}", selected.title);
    };

    const canAutoplay = () => activePage && visible && !hovered && !document.hidden && motionAllowed() && !card.contains(document.activeElement);
    const schedule = () => {
      clearTimeout(timer);
      if (!canAutoplay()) return;
      timer = setTimeout(() => {
        if (canAutoplay()) advance(false);
        schedule();
      }, 7500);
    };
    button.addEventListener('click', () => { advance(true); schedule(); });
    motion.addEventListener('change', () => { if (!motionAllowed()) finish?.(); schedule(); });
    window.addEventListener('pagehide', () => { activePage = false; finish?.(); schedule(); });
    if (card.dataset.randomAutoplay !== 'on' || typeof IntersectionObserver !== 'function') return;
    card.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') { hovered = true; schedule(); } });
    card.addEventListener('pointerleave', () => { hovered = false; schedule(); });
    card.addEventListener('focusin', schedule);
    card.addEventListener('focusout', () => queueMicrotask(schedule));
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('pageshow', () => { activePage = true; schedule(); });
    new IntersectionObserver(([entry]) => { visible = entry.isIntersecting && entry.intersectionRatio >= .35; schedule(); }, { threshold: .35 }).observe(card);
  });
})();

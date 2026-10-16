(() => {
  const root = document.documentElement;
  const layer = document.querySelector('.morii-atmosphere');
  if (!layer) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const contrast = matchMedia('(prefers-contrast: more), (forced-colors: active)');
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const connection = navigator.connection;
  const spotlight = document.currentScript?.dataset.spotlight === 'on';
  const tilt = document.currentScript?.dataset.tilt === 'on';
  const ripple = document.currentScript?.dataset.ripple === 'on';
  const canvas = document.getElementById('morii-particles');
  const ripples = new Map();
  let context, points = [], width = 0, height = 0, frame = 0, previous = 0;
  let pointer, card, dirty = false, stopped = false, printing = false;
  let color = '#5568f6';
  const cards = spotlight || tilt ? [...document.querySelectorAll('#main :is(.feature-card, .post-card, .selected-card, .discovery-card, .friend-card, .related-card)')] : [];
  const allowed = () => !stopped && !printing && !document.hidden && root.dataset.motion !== 'off' && !reduced.matches && !contrast.matches && !connection?.saveData;
  const clearCard = () => {
    card?.removeAttribute('data-light-active');
    card?.style.removeProperty('--tilt-x'); card?.style.removeProperty('--tilt-y');
    card = undefined; dirty = false;
  };
  const schedule = () => { if (!frame && allowed() && (context || dirty)) frame = requestAnimationFrame(draw); };
  const stop = () => {
    cancelAnimationFrame(frame); frame = 0; previous = 0; pointer = undefined; clearCard();
    context?.clearRect(0, 0, width, height);
    for (const [node, animation] of ripples) { animation.cancel(); node.remove(); }
    ripples.clear();
    root.setAttribute('data-effects-paused', '');
  };
  const resize = () => {
    width = window.innerWidth; height = window.innerHeight;
    if (!context || !width || !height) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    const configured = Number(canvas.dataset.density);
    const count = Math.min(width < 768 ? 18 : 80, Math.max(12, Number.isFinite(configured) ? configured : 48));
    points = Array.from({ length: Math.round(count) }, () => ({ x: Math.random() * width, y: Math.random() * height, vx: (Math.random() - .5) * 13, vy: -5 - Math.random() * 10, radius: .8 + Math.random() * 1.4 }));
    previous = 0;
  };
  const palette = () => { color = getComputedStyle(root).getPropertyValue('--accent').trim() || '#5568f6'; };
  function draw(time) {
    frame = 0;
    if (!allowed()) { stop(); return; }
    if (dirty && card && pointer) {
      const rect = card.getBoundingClientRect();
      card.style.setProperty('--light-x', `${pointer.x - rect.left}px`);
      card.style.setProperty('--light-y', `${pointer.y - rect.top}px`);
      if (tilt && rect.width && rect.height) {
        const clamp = value => Math.max(-1, Math.min(1, value));
        card.style.setProperty('--tilt-x', `${clamp((pointer.y - rect.top) / rect.height * 2 - 1) * -3}deg`);
        card.style.setProperty('--tilt-y', `${clamp((pointer.x - rect.left) / rect.width * 2 - 1) * 3}deg`);
      }
      card.setAttribute('data-light-active', ''); dirty = false;
    }
    if (context && (!previous || time - previous >= 32)) {
      const elapsed = previous ? Math.min((time - previous) / 1000, .06) : 0;
      previous = time;
      context.clearRect(0, 0, width, height);
      context.fillStyle = color; context.strokeStyle = color;
      points.forEach((point, index) => {
        point.x = (point.x + point.vx * elapsed + width) % width;
        point.y = (point.y + point.vy * elapsed + height) % height;
        if (pointer && fine.matches) {
          const dx = point.x - pointer.x, dy = point.y - pointer.y, distance = Math.hypot(dx, dy);
          if (distance > 0 && distance < 110) { const force = (1 - distance / 110) * elapsed * 28; point.x += dx / distance * force; point.y += dy / distance * force; }
        }
        context.globalAlpha = .38;
        context.beginPath(); context.arc(point.x, point.y, point.radius, 0, Math.PI * 2); context.fill();
        let links = 0;
        for (let next = index + 1; next < points.length && links < 3; next++) {
          const other = points[next], distance = Math.hypot(point.x - other.x, point.y - other.y);
          if (distance < 125) {
            context.globalAlpha = (1 - distance / 125) * .17; context.lineWidth = .7;
            context.beginPath(); context.moveTo(point.x, point.y); context.lineTo(other.x, other.y); context.stroke(); links++;
          }
        }
      });
      context.globalAlpha = 1;
    }
    schedule();
  }
  const sync = () => {
    if (!allowed()) { stop(); return; }
    root.removeAttribute('data-effects-paused');
    if (canvas && !context) {
      try { context = canvas.getContext('2d', { alpha: true }); } catch { /* Static atmosphere remains available. */ }
      if (context) resize();
    }
    palette(); schedule();
  };
  cards.forEach(element => {
    element.classList.add('morii-interactive-card');
    if (tilt) element.classList.add('morii-tilt');
    if (spotlight) {
      element.classList.add('morii-spotlight');
      const light = document.createElement('span'); light.className = 'morii-card-light'; light.setAttribute('aria-hidden', 'true'); element.append(light);
    }
  });
  document.addEventListener('pointermove', event => {
    if (!allowed() || !fine.matches || event.pointerType === 'touch') return;
    pointer = { x: event.clientX, y: event.clientY };
    const target = event.target instanceof Element ? event.target.closest('.morii-interactive-card') : null;
    if (card !== target) { clearCard(); card = target; }
    dirty = Boolean(card); schedule();
  }, { passive: true });
  document.addEventListener('pointerleave', () => { pointer = undefined; clearCard(); });
  window.addEventListener('scroll', () => { pointer = undefined; clearCard(); }, { passive: true });
  window.addEventListener('resize', () => { clearCard(); resize(); schedule(); }, { passive: true });
  document.addEventListener('visibilitychange', sync);
  [reduced, contrast, fine].forEach(media => media.addEventListener('change', () => { stop(); sync(); }));
  connection?.addEventListener?.('change', sync);
  new MutationObserver(palette).observe(root, { attributes: true, attributeFilter: ['data-theme', 'style'] });
  if (ripple && typeof Element.prototype.animate === 'function') document.addEventListener('click', event => {
    if (!allowed() || event.button > 0 || !(event.target instanceof Element)) return;
    const host = event.target.closest('button, a.button');
    if (!host || host.disabled || host.getAttribute('aria-disabled') === 'true') return;
    const rect = host.getBoundingClientRect(), size = Math.hypot(rect.width, rect.height) * 2;
    if (!size) return;
    host.classList.add('morii-ripple-host');
    const node = document.createElement('span'); node.className = 'morii-ripple'; node.setAttribute('aria-hidden', 'true');
    node.style.width = node.style.height = `${size}px`;
    node.style.left = `${(event.detail ? event.clientX - rect.left : rect.width / 2) - size / 2}px`;
    node.style.top = `${(event.detail ? event.clientY - rect.top : rect.height / 2) - size / 2}px`;
    if (ripples.size >= 8) { const [old, animation] = ripples.entries().next().value; animation.cancel(); old.remove(); ripples.delete(old); }
    host.append(node);
    try {
      const animation = node.animate([{ transform: 'scale(0)', opacity: .25 }, { transform: 'scale(1)', opacity: 0 }], { duration: 520, easing: 'ease-out' });
      ripples.set(node, animation);
      animation.finished.catch(() => {}).finally(() => { node.remove(); ripples.delete(node); });
    } catch { node.remove(); }
  });
  window.addEventListener('pagehide', () => { stopped = true; stop(); });
  window.addEventListener('pageshow', () => { stopped = false; sync(); });
  window.addEventListener('beforeprint', () => { printing = true; stop(); });
  window.addEventListener('afterprint', () => { printing = false; sync(); });
  sync();
})();

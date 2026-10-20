(() => {
  const article = document.querySelector('.article-body');
  const banner = document.getElementById('reading-resume');
  if (!article || !banner) return;
  const key = 'morii-reading-progress';
  const path = new URL(document.querySelector('link[rel="canonical"]')?.href || location.href).pathname.replace(/index\.html$/, '');
  const updated = banner.dataset.updated || '';
  const lifetime = 90 * 86400000;
  let timer;
  let interacted = false;
  let cleared = false;
  const read = () => {
    try {
      const entries = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(entries)) return [];
      return entries.filter(item => item && typeof item.path === 'string' && item.path.startsWith('/') && typeof item.updated === 'string' && Number.isFinite(item.ratio) && item.ratio >= .03 && item.ratio < .97 && Number.isFinite(item.at) && Date.now() - item.at < lifetime && item.at <= Date.now() + 60000).slice(0, 50);
    } catch { return []; }
  };
  const write = entries => {
    try { localStorage.setItem(key, JSON.stringify(entries.sort((a, b) => b.at - a.at).slice(0, 50))); }
    catch { /* Reading remains available when browser storage is blocked. */ }
  };
  const geometry = () => ({ start: article.getBoundingClientRect().top + window.scrollY - 130, distance: article.offsetHeight - window.innerHeight + 160 });
  const save = () => {
    clearTimeout(timer);
    if (!interacted || cleared || document.documentElement.dataset.printPreview === 'true' || document.querySelector('dialog[open]')) return;
    const { start, distance } = geometry();
    if (distance < 300) return;
    const ratio = Math.max(0, Math.min(1, (window.scrollY - start) / distance));
    if (ratio < .03) return;
    const remaining = read().filter(item => item.path !== path);
    if (ratio >= .97) { write(remaining); return; }
    let anchor;
    for (const heading of article.querySelectorAll('h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]')) {
      if (heading.getBoundingClientRect().top > 150) break;
      anchor = heading;
    }
    write([...remaining, { path, updated, ratio, at: Date.now(), anchor: anchor?.id || '', offset: anchor ? window.scrollY - (anchor.getBoundingClientRect().top + window.scrollY) : 0 }]);
  };
  const saved = read().find(item => item.path === path && item.updated === updated);
  if (saved && !location.hash && window.scrollY < 200) {
    const heading = typeof saved.anchor === 'string' ? document.getElementById(saved.anchor) : null;
    const label = heading?.cloneNode(true);
    label?.querySelectorAll('.headerlink').forEach(link => link.remove());
    const description = document.getElementById('reading-resume-description');
    if (description) description.textContent = `上次读到 ${Math.round(saved.ratio * 100)}%${label ? ` · ${label.textContent.trim()}` : ''}。进度仅保存在当前浏览器。`;
    banner.hidden = false;
  }
  document.getElementById('reading-resume-continue')?.addEventListener('click', () => {
    if (!saved) return;
    banner.hidden = true;
    const { start, distance } = geometry();
    const heading = typeof saved.anchor === 'string' ? document.getElementById(saved.anchor) : null;
    const validAnchor = heading && article.contains(heading) && Number.isFinite(saved.offset) && Math.abs(saved.offset) < 10000000;
    const target = validAnchor ? heading.getBoundingClientRect().top + window.scrollY + saved.offset : start + distance * saved.ratio;
    interacted = true;
    window.scrollTo({ top: Math.max(0, target), behavior: 'instant' });
    // Move keyboard focus without changing the restored reading position.
    const focus = validAnchor ? heading : article;
    const tabindex = focus.getAttribute('tabindex');
    focus.setAttribute('tabindex', '-1');
    focus.focus({ preventScroll: true });
    focus.addEventListener('blur', () => { if (tabindex === null) focus.removeAttribute('tabindex'); else focus.setAttribute('tabindex', tabindex); }, { once: true });
  });
  document.getElementById('reading-resume-clear')?.addEventListener('click', () => {
    cleared = true;
    clearTimeout(timer);
    write(read().filter(item => item.path !== path));
    banner.hidden = true;
    const announcement = document.getElementById('theme-announcement');
    if (announcement) announcement.textContent = '已清除此篇阅读记录，本次访问不再保存。';
  });
  const interact = () => { interacted = true; };
  for (const event of ['wheel', 'touchstart', 'pointerdown', 'keydown']) document.addEventListener(event, interact, { passive: true });
  window.addEventListener('scroll', () => { if (!interacted || cleared) return; clearTimeout(timer); timer = setTimeout(save, 800); }, { passive: true });
  window.addEventListener('pagehide', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
})();

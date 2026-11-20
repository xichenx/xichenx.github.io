(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  const root = document.documentElement;
  // Hidden dialogs, motion and the inactive music capsule do not block first paint.
  document.querySelectorAll('link[data-deferred-style]').forEach(link => { link.media = 'all'; });
  const themeButton = document.getElementById('theme-toggle');
  const syncThemeButton = () => {
    if (!themeButton) return;
    const dark = root.dataset.theme === 'dark';
    themeButton.setAttribute('aria-pressed', String(dark));
    themeButton.setAttribute('aria-label', dark ? t("切换浅色模式") : t("切换深色模式"));
    themeButton.title = dark ? t("切换浅色模式") : t("切换深色模式");
  };
  syncThemeButton();
  const brandLogo = document.querySelector('.brand__mark--image img');
  const restoreBrandMark = () => {
    const mark = brandLogo?.parentElement;
    if (!mark) return;
    mark.classList.remove('brand__mark--image');
    mark.textContent = '✦';
  };
  brandLogo?.addEventListener('error', restoreBrandMark, { once: true });
  if (brandLogo?.complete && brandLogo.naturalWidth === 0) restoreBrandMark();
  document.querySelectorAll('[data-cover-frame] > img').forEach(image => {
    const frame = image.parentElement;
    const ready = () => { frame.dataset.imageState = image.naturalWidth > 0 ? 'ready' : 'error'; };
    image.addEventListener('load', ready);
    image.addEventListener('error', () => { frame.dataset.imageState = 'error'; });
    if (image.complete) ready(); else frame.dataset.imageState = 'loading';
  });
  const reducedThemeMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let themeTransition;
  const applyTheme = next => {
    root.dataset.theme = next;
    try { localStorage.setItem('morii-theme', root.dataset.theme); } catch { /* Keep the in-memory preference. */ }
    syncThemeButton();
  };
  const finishTransition = () => {
    themeTransition = undefined;
    delete root.dataset.themeReveal;
    themeButton?.removeAttribute('aria-busy');
  };
  themeButton?.addEventListener('click', event => {
    if (themeTransition) return;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    if (root.dataset.themeTransition !== 'on' || root.dataset.motion === 'off' || reducedThemeMotion?.matches || navigator.connection?.saveData || typeof document.startViewTransition !== 'function' || typeof root.animate !== 'function') { applyTheme(next); return; }
    const rect = themeButton.getBoundingClientRect();
    const x = event.detail ? event.clientX : rect.left + rect.width / 2;
    const y = event.detail ? event.clientY : rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    let applied = false;
    const update = () => { applied = true; applyTheme(next); };
    root.dataset.themeReveal = 'on'; themeButton.setAttribute('aria-busy', 'true');
    try {
      themeTransition = document.startViewTransition(update);
      themeTransition.ready.then(() => {
        if (root.dataset.motion === 'off' || reducedThemeMotion?.matches) { themeTransition?.skipTransition(); return; }
        const animation = root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, { duration: 480, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)' });
        animation.finished.catch(() => {});
      }).catch(() => { themeTransition?.skipTransition(); });
      themeTransition.finished.catch(() => { if (!applied) update(); }).finally(finishTransition);
    } catch { if (!applied) update(); finishTransition(); }
  });
  const skipThemeTransition = () => themeTransition?.skipTransition();
  reducedThemeMotion?.addEventListener('change', skipThemeTransition);
  window.addEventListener('pagehide', skipThemeTransition);
  window.addEventListener('beforeprint', skipThemeTransition);

  const systemTheme = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : null;
  systemTheme?.addEventListener('change', event => {
    let stored;
    try { stored = localStorage.getItem('morii-theme') || localStorage.getItem('mingzhi-theme'); } catch { /* Follow the system. */ }
    if (stored !== 'light' && stored !== 'dark') {
      root.dataset.theme = event.matches ? 'dark' : 'light';
      syncThemeButton();
    }
  });

  const menu = document.querySelector('.site-nav');
  const siteHeader = document.querySelector('.site-header');
  if (siteHeader) {
    const backdrop = document.querySelector('main [data-header-backdrop="inverse"]');
    let headerFrame;
    const updateHeader = () => {
      headerFrame = undefined;
      siteHeader.toggleAttribute('data-header-top', window.scrollY <= 8);
      if (backdrop) siteHeader.toggleAttribute('data-header-past-backdrop', backdrop.getBoundingClientRect().bottom <= siteHeader.offsetHeight);
    };
    const scheduleHeader = () => { headerFrame ??= requestAnimationFrame(updateHeader); };
    window.addEventListener('scroll', scheduleHeader, { passive: true });
    window.addEventListener('resize', scheduleHeader);
    window.addEventListener('pageshow', scheduleHeader);
    if (backdrop && typeof ResizeObserver === 'function') new ResizeObserver(scheduleHeader).observe(backdrop);
    updateHeader();
  }
  const menuToggle = document.getElementById('menu-toggle');
  const closeMenu = (restoreFocus = false) => {
    const wasOpen = menu?.classList.contains('is-open');
    menu?.classList.remove('is-open');
    menuToggle?.setAttribute('aria-expanded', 'false');
    menuToggle?.setAttribute('aria-label', t("打开菜单"));
    if (restoreFocus && wasOpen) menuToggle?.focus();
  };
  menuToggle?.addEventListener('click', () => {
    const open = menu?.classList.toggle('is-open');
    menuToggle.setAttribute('aria-expanded', String(Boolean(open)));
    menuToggle.setAttribute('aria-label', open ? t("关闭菜单") : t("打开菜单"));
  });
  document.addEventListener('click', event => {
    if (!menu?.contains(event.target) && !menuToggle?.contains(event.target)) closeMenu();
  });

  const dialog = document.getElementById('search-dialog');
  const input = document.getElementById('search-input');
  let searchScript;
  let searchReady = false;
  const loadSearch = () => {
    if (!dialog?.dataset.searchScript || searchReady) return Promise.resolve();
    if (searchScript) return searchScript;
    searchScript = new Promise((resolve, reject) => {
      const node = document.createElement('script'); node.src = dialog.dataset.searchScript;
      const timer = setTimeout(() => { node.remove(); reject(new Error('Search timeout')); }, 10000);
      node.onload = () => { clearTimeout(timer); searchReady = true; resolve(); };
      node.onerror = () => { clearTimeout(timer); node.remove(); reject(new Error('Search unavailable')); };
      document.head.append(node);
    }).then(() => { if (dialog.open) dialog.dispatchEvent(new Event('morii:search-open')); }).catch(() => {
      searchScript = null;
      const status = document.getElementById('search-service-status'); if (status) status.textContent = t("搜索加载失败，请重试。");
      const retry = document.getElementById('search-retry'); if (retry) retry.hidden = false;
    });
    return searchScript;
  };
  document.getElementById('search-retry')?.addEventListener('click', () => { if (!searchReady) loadSearch(); });
  const openSearch = () => {
    if (root.dataset.printPreview === 'true') return;
    if (!dialog || dialog.open) return;
    const navigation = document.getElementById('navigation-dialog');
    if (navigation?.open) navigation.close();
    closeMenu();
    dialog.showModal();
    input?.focus();
    if (searchReady || !dialog.dataset.searchScript) dialog.dispatchEvent(new Event('morii:search-open'));
    else loadSearch();
  };
  document.querySelectorAll('#search-open, [data-open-search]').forEach(button => button.addEventListener('click', openSearch));
  document.getElementById('search-close')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      dialog?.open ? dialog.close() : openSearch();
    }
    if (event.key === 'Escape' && menu?.classList.contains('is-open')) {
      event.preventDefault();
      closeMenu(true);
    }
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth > 800) closeMenu();
  });

  const fallbackImage = image => {
    if (!(image instanceof HTMLImageElement) || !image.closest('.post-card__media, .selected-card__media')) return;
    image.hidden = true;
    if (image.parentElement.querySelector('.post-card__placeholder')) return;
    const placeholder = document.createElement('span');
    placeholder.className = 'post-card__placeholder';
    placeholder.textContent = '✦';
    placeholder.setAttribute('aria-hidden', 'true');
    image.parentElement.append(placeholder);
  };
  document.addEventListener('error', event => fallbackImage(event.target), true);
  document.querySelectorAll('.post-card__media img, .selected-card__media img').forEach(image => {
    if (image.complete && image.naturalWidth === 0) fallbackImage(image);
  });

  const backToTop = document.getElementById('back-to-top');
  if (backToTop) {
    const showPercent = backToTop.hasAttribute('data-back-top-percent');
    const updateBackToTop = () => {
      const offset = window.scrollY;
      const hidden = offset < 500;
      if (backToTop.hidden !== hidden) backToTop.hidden = hidden;
      if (!showPercent || hidden) return;
      const scroller = document.scrollingElement || root;
      const distance = Math.max(1, scroller.scrollHeight - scroller.clientHeight);
      const text = Math.round(Math.min(offset / distance, 1) * 100) + '%';
      if (backToTop.textContent !== text) backToTop.textContent = text;
    };
    window.addEventListener('scroll', updateBackToTop, { passive: true });
    if (showPercent) {
      window.addEventListener('resize', updateBackToTop);
      if (typeof ResizeObserver === 'function') new ResizeObserver(updateBackToTop).observe(document.body);
    }
    updateBackToTop();
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    });
  }

  // Warm a same-origin page only when a visitor shows intent to open it.
  // This is especially useful when the HTML response has a variable network delay.
  const prefetched = new Set();
  let pendingPrefetch;
  const prefetch = link => {
    if (!link || prefetched.size >= 4 || navigator.connection?.saveData || /(^|-)2g$/.test(navigator.connection?.effectiveType || '')) return;
    if (link.hasAttribute('download') || link.target && link.target !== '_self') return;
    let url;
    try { url = new URL(link.href, location.href); } catch { return; }
    if (url.origin !== location.origin || !/^https?:$/.test(url.protocol) || !/\/$|\.html?$/.test(url.pathname)) return;
    if (url.pathname === location.pathname && url.search === location.search) return;
    url.hash = '';
    if (prefetched.has(url.href)) return;
    prefetched.add(url.href);
    const hint = document.createElement('link');
    hint.rel = 'prefetch'; hint.as = 'document'; hint.href = url.href;
    document.head.append(hint);
  };
  document.addEventListener('pointerover', event => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!link || link.contains(event.relatedTarget)) return;
    clearTimeout(pendingPrefetch);
    pendingPrefetch = setTimeout(() => prefetch(link), 90);
  }, { passive: true });
  document.addEventListener('pointerout', event => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (link && !link.contains(event.relatedTarget)) clearTimeout(pendingPrefetch);
  }, { passive: true });
  document.addEventListener('focusin', event => {
    if (!(event.target instanceof Element)) return;
    prefetch(event.target.closest('a[href]'));
    const category = event.target.closest('.category-nav a');
    // Native focus may expose only a sliver of a link in a horizontal scroller.
    category?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  });
  window.addEventListener('pagehide', () => clearTimeout(pendingPrefetch));
})();

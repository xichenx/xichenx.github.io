(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  const safeUrl = value => {
    try {
      const url = new URL(String(value || ''));
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch { return ''; }
  };

  const feed = document.querySelector('.feed-section');
  if (feed) {
    const grid = feed.querySelector('.feed-grid');
    const status = feed.querySelector('.feed-status');
    const heading = document.getElementById('feed-heading');
    const pagination = feed.querySelector('.feed-pagination');
    const pageLabel = document.getElementById('feed-page');
    const previous = document.getElementById('feed-prev');
    const more = document.getElementById('feed-more');
    const retry = document.getElementById('feed-retry');
    const pageSize = Math.min(50, Math.max(1, Number(feed.dataset.pageSize) || 12));
    const endpoint = safeUrl(feed.dataset.feedEndpoint);
    const seen = new Set();
    const pages = [];
    let currentPage = 0;
    let nextOffset = 0;
    let failedPage;
    let hasMore = true;
    let loading = false;

    const createCard = entry => {
      const url = safeUrl(entry.link || entry.url);
      if (!url || typeof entry.title !== 'string' || !entry.title.trim() || seen.has(url)) return;
      seen.add(url);
      const card = document.createElement('article');
      card.className = 'feed-card panel';
      const meta = document.createElement('div');
      meta.className = 'feed-card__meta';
      const avatar = safeUrl(entry.avatar);
      if (avatar) {
        const image = document.createElement('img');
        image.src = avatar;
        image.alt = '';
        image.loading = 'lazy';
        image.referrerPolicy = 'no-referrer';
        meta.append(image);
      }
      const author = document.createElement('span');
      author.textContent = [entry.author, entry.name].find(value => typeof value === 'string' && value.trim()) || t("朋友的博客");
      meta.append(author);
      const title = document.createElement('h3');
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = entry.title;
      title.append(link);
      const time = document.createElement('time');
      const rawDate = [entry.created, entry.date, entry.updated].find(value => typeof value === 'string' && value.trim()) || '';
      const parsed = new Date(rawDate);
      if (!Number.isNaN(parsed.getTime())) {
        time.dateTime = parsed.toISOString();
        time.textContent = parsed.toLocaleDateString((window.MoriiI18n?.locale || 'zh-CN'));
      }
      card.append(meta, title, time);
      return card;
    };

    const canAdvance = () => currentPage + 1 < pages.length || hasMore;
    const syncPagination = () => {
      pagination.hidden = !pages.length;
      pageLabel.textContent = t("第 {0} 页", currentPage + 1);
      previous.disabled = loading || currentPage === 0;
      more.disabled = loading || failedPage != null || !canAdvance();
      retry.hidden = failedPage == null || loading;
    };
    const showPage = (index, moveFocus) => {
      currentPage = index;
      failedPage = undefined;
      grid.replaceChildren(...pages[index]);
      status.textContent = t("本页 {0} 篇文章", pages[index].length) + (canAdvance() ? '' : t(" · 已经到底了"));
      if (moveFocus) {
        heading.focus({ preventScroll: true });
        heading.scrollIntoView?.({ block: 'start', behavior: 'instant' });
      }
    };
    const loadFeed = async (index, moveFocus = false) => {
      if (loading || !endpoint) return;
      loading = true;
      syncPagination();
      grid.setAttribute('aria-busy', 'true');
      status.textContent = index ? t("正在加载更多文章…") : t("正在寻找朋友们的新鲜事…");
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const url = new URL(endpoint);
        url.searchParams.set('start', String(nextOffset));
        url.searchParams.set('end', String(nextOffset + pageSize));
        const response = await fetch(url.href, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error('Feed unavailable');
        const payload = await response.json();
        const items = Array.isArray(payload) ? payload : payload.article_data ?? payload.items ?? payload.data?.article_data ?? payload.data;
        if (!items || typeof items !== 'object') throw new Error('Unexpected feed response');
        const entries = Array.isArray(items) ? items : Object.values(items);
        const cards = entries.filter(item => item && typeof item === 'object').map(createCard).filter(Boolean);
        nextOffset += entries.length;
        hasMore = entries.length >= pageSize && cards.length > 0;
        failedPage = undefined;
        if (cards.length) {
          pages.push(cards);
          showPage(index, moveFocus);
        } else if (pages.length) {
          showPage(currentPage, moveFocus);
        } else {
          status.textContent = t("朋友们还没有新的文章，先去他们的博客坐坐吧。");
        }
      } catch {
        failedPage = index;
        status.textContent = pages.length ? t("更多文章暂时加载失败，已加载的内容仍可阅读。") : t("暂时连不上朋友圈，稍后重试，或从下方友链继续逛逛。");
      } finally {
        clearTimeout(timeout);
        loading = false;
        syncPagination();
        grid.setAttribute('aria-busy', 'false');
        if (failedPage != null && moveFocus) retry.focus({ preventScroll: true });
      }
    };
    const goToPage = index => {
      if (loading || index < 0) return;
      if (index < pages.length) {
        showPage(index, true);
        syncPagination();
      } else if (canAdvance()) {
        loadFeed(index, true);
      }
    };
    previous.addEventListener('click', () => goToPage(currentPage - 1));
    more.addEventListener('click', () => goToPage(currentPage + 1));
    retry.addEventListener('click', () => { if (failedPage != null) loadFeed(failedPage, true); });
    if (endpoint) loadFeed(0);
    else {
      grid.setAttribute('aria-busy', 'false');
      status.textContent = t("先去朋友们的博客坐坐，动态会在接入后显示在这里。");
    }
  }

  const service = document.getElementById('comment-service');
  const recent = document.querySelector('[data-recent-comments]');
  if (!service && !recent) return;
  const provider = service?.dataset.provider || 'twikoo';
  const client = () => provider === 'waline' ? window.Waline : window.twikoo;
  let script;
  let scriptLoading;
  const loadScript = () => {
    if (typeof client()?.init === 'function') return Promise.resolve();
    if (scriptLoading) return scriptLoading;
    scriptLoading = new Promise((resolve, reject) => {
      script?.remove(); script = document.createElement('script');
      script.src = (service || recent).dataset.script; script.async = true;
      const timer = setTimeout(() => { script.remove(); reject(new Error('Comment script timeout')); }, 12000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Comment script unavailable')); };
      document.head.append(script);
    }).finally(() => { scriptLoading = null; });
    return scriptLoading;
  };
  const whenVisible = (element, action) => {
    if (typeof IntersectionObserver !== 'function') { if (element === recent) action(); return; }
    let active = true;
    const stop = () => {
      if (!active) return;
      active = false;
      observer.disconnect();
    };
    const observer = new IntersectionObserver(entries => {
      if (active && entries.some(entry => entry.isIntersecting)) {
        stop();
        action();
      }
    }, { rootMargin: '180px' });
    observer.observe(element);
    return stop;
  };
  if (recent) {
    let pending = false;
    const list = recent.querySelector('[data-recent-list]');
    const status = recent.querySelector('[data-recent-status]');
    const retry = recent.querySelector('[data-recent-retry]');
    const loadRecent = async () => {
      if (pending) return;
      pending = true; retry.hidden = true; status.hidden = false; status.textContent = t("正在加载评论…");
      let timeout;
      try {
        await loadScript();
        if (typeof window.twikoo?.getRecentComments !== 'function') throw new Error('Recent comments unavailable');
        const data = await Promise.race([window.twikoo.getRecentComments({ envId: recent.dataset.env, pageSize: Number(recent.dataset.limit) || 5, includeReply: false }), new Promise((resolve, reject) => { timeout = setTimeout(() => reject(new Error('Timeout')), 12000); })]);
        if (!Array.isArray(data)) throw new Error('Invalid recent comments');
        list.replaceChildren(...data.slice(0, 10).flatMap(item => {
          let url; try { url = new URL(item.url, location.href); if (url.origin !== location.origin || !/^https?:$/.test(url.protocol)) return []; } catch { return []; }
          const row = document.createElement('li'); const link = document.createElement('a'); link.href = url.href;
          const nick = document.createElement('strong'); nick.textContent = String(item.nick || t("访客")).slice(0, 80);
          const comment = document.createElement('span'); comment.textContent = String(item.commentText || '').slice(0, 120);
          link.append(nick, comment); row.append(link); return [row];
        }));
        status.textContent = t("暂时还没有评论。"); status.hidden = list.children.length > 0;
      } catch { status.textContent = t("评论服务暂时不可用，可以稍后重新加载。"); retry.hidden = false; }
      finally { clearTimeout(timeout); pending = false; }
    };
    retry.addEventListener('click', loadRecent); whenVisible(recent, loadRecent);
  }
  if (!service) return;
  const status = service.querySelector('.comment-status');
  const button = document.getElementById('comments-load');
  let loading = false;
  let loaded = false;
  let stopObserving;
  const loadComments = async () => {
    if (loading || loaded) return;
    stopObserving?.();
    stopObserving = undefined;
    loading = true; button.disabled = true; service.setAttribute('aria-busy', 'true'); status.textContent = t("正在加载评论…");
    let initTimeout;
    try {
      await loadScript();
      if (typeof client()?.init !== 'function') throw new Error('Comment client unavailable');
      let options;
      if (provider === 'waline') {
        if (!service.dataset.server) throw new Error('Comment configuration unavailable');
        if (!document.querySelector('[data-waline-style]')) { const css = document.createElement('link'); css.rel = 'stylesheet'; css.href = service.dataset.style; css.dataset.walineStyle = ''; document.head.append(css); }
        options = { el: '#waline', serverURL: service.dataset.server, path: location.pathname, lang: document.documentElement.lang || 'zh-CN', dark: 'html[data-theme="dark"]' };
      } else {
        if (!service.dataset.env) throw new Error('Comment configuration unavailable');
        options = { el: '#twikoo', envId: service.dataset.env, lang: document.documentElement.lang || 'zh-CN' };
      }
      await Promise.race([Promise.resolve(client().init(options)), new Promise((resolve, reject) => { initTimeout = setTimeout(() => reject(new Error('Comment service timeout')), 15000); })]);
      loaded = true; button.hidden = true; status.hidden = true;
    } catch (error) {
      status.hidden = false; status.textContent = t("评论服务暂时不可用，可以稍后重新加载。");
      console.warn('[Morii comments]', error); button.textContent = t("重新加载评论");
    } finally { clearTimeout(initTimeout); loading = false; button.disabled = false; service.setAttribute('aria-busy', 'false'); }
  };
  button.addEventListener('click', loadComments);
  if (service.dataset.loadMode === 'immediate') loadComments();
  else if (service.dataset.loadMode !== 'manual') stopObserving = whenVisible(service, loadComments);
})();

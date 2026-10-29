(() => {
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
    const more = document.getElementById('feed-more');
    const retry = document.getElementById('feed-retry');
    const pageSize = Math.min(50, Math.max(1, Number(feed.dataset.pageSize) || 12));
    const endpoint = safeUrl(feed.dataset.feedEndpoint);
    const seen = new Set();
    let offset = 0;
    let loading = false;

    const renderEntry = entry => {
      const url = safeUrl(entry.link || entry.url);
      if (!url || !entry.title || seen.has(url)) return;
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
      author.textContent = entry.author || entry.name || '朋友的博客';
      meta.append(author);
      const title = document.createElement('h3');
      const link = document.createElement('a');
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = entry.title;
      title.append(link);
      const time = document.createElement('time');
      const rawDate = String(entry.created || entry.date || entry.updated || '');
      const parsed = new Date(rawDate);
      if (!Number.isNaN(parsed.getTime())) {
        time.dateTime = parsed.toISOString();
        time.textContent = parsed.toLocaleDateString('zh-CN');
      }
      card.append(meta, title, time);
      grid.append(card);
    };

    const loadFeed = async () => {
      if (loading || !endpoint) return;
      loading = true;
      more.disabled = true;
      retry.hidden = true;
      grid.setAttribute('aria-busy', 'true');
      status.textContent = offset ? '正在加载更多文章…' : '正在寻找朋友们的新鲜事…';
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const url = new URL(endpoint);
        url.searchParams.set('start', String(offset));
        url.searchParams.set('end', String(offset + pageSize));
        const response = await fetch(url.href, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
        if (!response.ok) throw new Error('Feed unavailable');
        const payload = await response.json();
        const items = Array.isArray(payload) ? payload : payload.article_data ?? payload.items ?? payload.data?.article_data ?? payload.data;
        if (!items || typeof items !== 'object') throw new Error('Unexpected feed response');
        const entries = Array.isArray(items) ? items : Object.values(items);
        const previousCount = seen.size;
        entries.filter(item => item && typeof item === 'object').forEach(renderEntry);
        offset += entries.length;
        const hasMore = entries.length >= pageSize && seen.size > previousCount;
        more.hidden = !hasMore;
        status.textContent = seen.size ? `已收集 ${seen.size} 篇朋友的文章${hasMore ? '' : ' · 已经到底了'}` : '朋友们还没有新的文章，先去他们的博客坐坐吧。';
      } catch {
        status.textContent = seen.size ? '更多文章暂时加载失败，已加载的内容仍可阅读。' : '暂时连不上朋友圈，稍后重试，或从下方友链继续逛逛。';
        retry.hidden = false;
        more.hidden = true;
      } finally {
        clearTimeout(timeout);
        loading = false;
        more.disabled = false;
        grid.setAttribute('aria-busy', 'false');
      }
    };
    more.addEventListener('click', loadFeed);
    retry.addEventListener('click', loadFeed);
    if (endpoint) loadFeed();
    else {
      grid.setAttribute('aria-busy', 'false');
      status.textContent = '先去朋友们的博客坐坐，动态会在接入后显示在这里。';
    }
  }

  const service = document.getElementById('comment-service');
  if (!service) return;
  const status = service.querySelector('.comment-status');
  const button = document.getElementById('comments-load');
  let loading = false;
  let loaded = false;
  let script;

  const loadScript = () => {
    if (typeof window.twikoo?.init === 'function') return Promise.resolve();
    return new Promise((resolve, reject) => {
      script?.remove();
      script = document.createElement('script');
      script.src = service.dataset.script;
      script.async = true;
      const timer = setTimeout(() => { script.remove(); reject(new Error('Comment script timeout')); }, 12000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Comment script unavailable')); };
      document.head.append(script);
    });
  };
  const loadComments = async () => {
    if (loading || loaded) return;
    loading = true;
    button.disabled = true;
    service.setAttribute('aria-busy', 'true');
    status.textContent = '正在加载评论…';
    try {
      await loadScript();
      if (typeof window.twikoo?.init !== 'function' || !service.dataset.env) throw new Error('Comment configuration unavailable');
      let initTimeout;
      try {
        await Promise.race([
          window.twikoo.init({ el: '#twikoo', envId: service.dataset.env }),
          new Promise((resolve, reject) => { initTimeout = setTimeout(() => reject(new Error('Comment service timeout')), 15000); })
        ]);
      } finally { clearTimeout(initTimeout); }
      loaded = true;
      button.hidden = true;
      status.hidden = true;
    } catch (error) {
      status.hidden = false;
      status.textContent = '评论服务暂时不可用，可以稍后重新加载。';
      console.warn('[Morii comments]', error);
      button.textContent = '重新加载评论';
    } finally {
      loading = false;
      button.disabled = false;
      service.setAttribute('aria-busy', 'false');
    }
  };
  button.addEventListener('click', loadComments);
  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      loadComments();
    }, { rootMargin: '180px' });
    observer.observe(service);
  }
})();

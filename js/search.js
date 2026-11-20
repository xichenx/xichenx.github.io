(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  const dialog = document.getElementById('search-dialog');
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');
  const service = document.getElementById('search-service-status');
  const retry = document.getElementById('search-retry');
  const more = document.getElementById('search-more');
  if (!dialog || !input || !results) return;
  const status = document.getElementById('search-status');
  const empty = dialog.querySelector('.search-empty');
  const pageSize = Math.max(5, Math.min(30, Number(dialog.dataset.pageSize) || 10));
  const configuredSnippets = Number(dialog.dataset.snippetsPerArticle);
  const snippetLimit = Number.isInteger(configuredSnippets) && configuredSnippets >= 1 && configuredSnippets <= 3 ? configuredSnippets : 2;
  let entries = [...results.querySelectorAll('li')].map(item => ({
    title: item.querySelector('strong')?.textContent || '',
    url: item.querySelector('a')?.href || '',
    content: item.dataset.protected === 'true' ? '' : item.querySelector('.search-result-summary')?.textContent || '',
    topics: item.dataset.topics || '',
    date: item.querySelector('small')?.textContent || '',
    categories: (() => { try { return JSON.parse(item.dataset.categories || '[]'); } catch { return []; } })(),
    protected: item.dataset.protected === 'true'
  }));
  let shards = [];
  let inverted;
  let indexVersion = 1;
  let renderTicket = 0;
  let entriesRevision = 0;
  let workerEntriesRevision = -1;
  let workerEntriesSync;
  let restartBodies = false;
  const bucketCache = new Map();
  let corePromise;
  let worker;
  let workerReady;
  let workerFailed = false;
  let requestId = 0;
  const requests = new Map();
  const stopWorker = () => {
    worker?.terminate(); worker = null; workerReady = null; workerFailed = true;
    for (const request of requests.values()) { clearTimeout(request.timer); request.reject(new Error('Worker unavailable')); } requests.clear();
  };
  window.addEventListener('pagehide', stopWorker);
  window.addEventListener('pageshow', event => { if (event.persisted) workerFailed = false; });
  const core = () => {
    if (window.MoriiSearchEngine) return Promise.resolve(window.MoriiSearchEngine);
    if (corePromise) return corePromise;
    corePromise = new Promise((resolve, reject) => {
      if (!dialog.dataset.searchEngine) { reject(new Error('No search engine')); return; }
      const script = document.createElement('script'); script.src = dialog.dataset.searchEngine;
      const timer = setTimeout(() => { script.remove(); reject(new Error('Search engine timeout')); }, 8000);
      script.onload = () => { clearTimeout(timer); window.MoriiSearchEngine ? resolve(window.MoriiSearchEngine) : reject(new Error('Missing search engine')); };
      script.onerror = () => { clearTimeout(timer); script.remove(); reject(new Error('Search engine unavailable')); };
      document.head.append(script);
    }).catch(error => { corePromise = null; throw error; });
    return corePromise;
  };
  const send = (method, payload) => new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => { requests.delete(id); reject(new Error('Search worker timeout')); }, 5000);
    requests.set(id, { resolve, reject, timer });
    try { worker.postMessage({ id, method, payload }); } catch (error) { clearTimeout(timer); requests.delete(id); reject(error); }
  });
  const compute = async (method, payload) => {
    const originalPayload = payload;
    const engine = await core();
    if (method === 'rank' && payload.ticket !== renderTicket) return [];
    if (!workerFailed && dialog.dataset.searchWorker && typeof Worker === 'function') {
      try {
        if (!worker) {
          worker = new Worker(dialog.dataset.searchWorker); workerEntriesRevision = -1;
          worker.onmessage = event => {
            const request = requests.get(event.data?.id); if (!request) return;
            clearTimeout(request.timer); requests.delete(event.data.id);
            if (event.data.error) request.reject(new Error(event.data.error)); else request.resolve(event.data.result);
          };
          worker.onerror = stopWorker;
          workerReady = send('init', { engine: new URL(dialog.dataset.searchEngine, location.href).href });
        }
        await workerReady;
        if (method === 'rank') {
          if (payload.ticket !== renderTicket) return [];
          if (workerEntriesRevision !== payload.revision) { workerEntriesRevision = payload.revision; workerEntriesSync = send('entries', { entries: payload.entries }); }
          await workerEntriesSync;
          const { entries, ...query } = payload; payload = query;
        }
        const result = await send(method, payload); dialog.dataset.searchMode = 'worker'; return result;
      } catch { stopWorker(); }
    }
    dialog.dataset.searchMode = 'main'; return engine[method](originalPayload);
  };
  let bodyLoading;
  const loadedShards = new Set();
  const category = document.getElementById('search-category');
  const seenCategories = new Set(category ? [...category.options].map(option => option.value) : []);
  const updateCategories = () => {
    if (!category) return;
    for (const entry of entries) for (const name of entry.categories || []) if (!seenCategories.has(name)) {
      seenCategories.add(name); const option = document.createElement('option'); option.value = name; option.textContent = name; category.append(option);
    }
  };
  let loaded = false;
  let scope = 'all';
  const scroll = dialog.querySelector('.search-scroll');
  const clear = document.getElementById('search-clear');
  const heading = document.getElementById('search-results-heading');
  let loading;
  let visible = pageSize;
  let segmenter;
  try { segmenter = new Intl.Segmenter(window.MoriiI18n?.locale || 'zh-CN', { granularity: 'word' }); } catch { /* Exact words remain available. */ }
  const words = () => [...new Set(input.value.trim().toLowerCase().split(/\s+/).flatMap(word => segmenter ? [...segmenter.segment(word)].filter(part => part.isWordLike).map(part => part.segment) : [word]).filter(Boolean))].slice(0, 20);
  const matchPattern = keywords => keywords.length ? new RegExp([...keywords]
    .sort((a, b) => b.length - a.length)
    .map(word => word.replace(/[.*+?^$()|[\]\\{}]/g, '\\$&')).join('|'), 'giu') : null;
  const highlight = (element, text, pattern) => {
    if (!pattern) { element.textContent = text; return; }
    pattern.lastIndex = 0;
    let position = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > position) element.append(document.createTextNode(text.slice(position, match.index)));
      const mark = document.createElement('mark');
      mark.textContent = match[0];
      element.append(mark);
      position = match.index + match[0].length;
    }
    if (position < text.length) element.append(document.createTextNode(text.slice(position)));
  };
  const snippets = (content, pattern, limit) => {
    const excerpt = (start, end) => (start ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
    const previews = [];
    const seen = new Set();
    if (pattern) {
      let previousEnd = 0;
      for (let attempt = 0; attempt < 12 && previews.length < limit; attempt++) {
        pattern.lastIndex = previousEnd;
        const hit = pattern.exec(content);
        if (!hit) break;
        const start = Math.max(previousEnd, hit.index - 32);
        const end = Math.min(content.length, Math.max(start + 150, hit.index + hit[0].length));
        previousEnd = end;
        const text = content.slice(start, end).trim();
        if (seen.has(text)) continue;
        seen.add(text);
        previews.push(excerpt(start, end));
      }
    }
    return previews.length ? previews : [excerpt(0, Math.min(content.length, 150))];
  };
  const legacyMatches = keywords => {
    return entries.map((entry, index) => {
      const title = entry.title.toLowerCase();
      const haystack = scope === 'title' ? title : scope === 'topics' ? entry.topics.toLowerCase() : `${title} ${entry.content.toLowerCase()} ${entry.topics.toLowerCase()}`;
      return { entry, index, match: (!category?.value || entry.categories?.includes(category.value)) && keywords.every(word => haystack.includes(word)), score: (input.value.trim() && title === input.value.trim().toLowerCase() ? 20 : input.value.trim() && title.includes(input.value.trim().toLowerCase()) ? 10 : 0) + keywords.reduce((sum, word) => sum + (title.includes(word) ? 3 : entry.topics.toLowerCase().includes(word) ? 1 : 0), 0) };
    }).filter(item => item.match).sort((a, b) => b.score - a.score || a.index - b.index);
  };
  const render = () => {
    const keywords = words(), ticket = ++renderTicket;
    if (indexVersion !== 3) { draw(legacyMatches(keywords), keywords); return; }
    const snapshot = entries;
    compute('rank', { entries: snapshot, revision: entriesRevision, ticket, words: keywords, query: input.value, scope, category: category?.value || '' }).then(matches => {
      if (ticket === renderTicket) draw(matches.map(match => ({ ...match, entry: snapshot[match.index] })), keywords);
    }).catch(() => { if (ticket === renderTicket) draw(legacyMatches(keywords), keywords); });
  };
  const draw = (matches, keywords) => {
    const focused = document.activeElement?.closest?.('#search-results a');
    const focusedUrl = focused?.href;
    const pattern = matchPattern(keywords);
    results.replaceChildren(...matches.slice(0, visible).map(({ entry }) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = entry.url;
      const icon = document.createElement('span'); icon.className = 'search-result-icon'; icon.textContent = entry.protected ? '⌑' : '≡'; icon.setAttribute('aria-hidden', 'true');
      const body = document.createElement('div'); body.className = 'search-result-content';
      const title = document.createElement('strong'); title.className = 'search-result-title';
      highlight(title, entry.title, pattern);
      const previews = entry.protected ? [t("加密文章 · 输入密码后阅读全文")] :
        snippets(entry.content || entry.summary || '', pattern, scope === 'all' ? snippetLimit : 1);
      body.append(title);
      for (const preview of previews) {
        const summary = document.createElement('p');
        summary.className = 'search-result-summary';
        highlight(summary, preview, entry.protected ? null : pattern);
        body.append(summary);
      }
      const meta = document.createElement('small');
      meta.textContent = [entry.date, entry.protected ? t("加密文章") : entry.topics].filter(Boolean).join(' · ');
      const arrow = document.createElement('span'); arrow.className = 'search-result-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
      body.append(meta); link.append(icon, body, arrow);
      item.append(link);
      return item;
    }));
    if (focusedUrl) ([...results.querySelectorAll('a')].find(link => link.href === focusedUrl) || input).focus({ preventScroll: true });
    if (clear) clear.hidden = input.value.length === 0;
    if (heading) heading.textContent = keywords.length ? t("搜索结果") : t("最近文章");
    if (status) status.textContent = t("{0} {1} 篇文章 · 已展示 {2} 篇", keywords.length ? t("找到") : t("共"), matches.length, Math.min(visible, matches.length));
    if (empty) empty.hidden = matches.length > 0;
    if (more) more.hidden = matches.length <= visible;
  };
  const normalize = (data, seen = new Set()) => data.filter(entry => {
    if (!entry || typeof entry.title !== 'string' || typeof entry.url !== 'string') return false;
    try {
      const url = new URL(entry.url, location.href);
      if (url.origin !== location.origin || !/^https?:$/.test(url.protocol) || seen.has(url.href)) return false;
      seen.add(url.href); entry.url = url.href;
      entry.content = entry.protected ? '' : String(entry.content || '');
      entry.topics = entry.protected ? '' : String(entry.topics || '');
      entry.categories = entry.protected ? [] : Array.isArray(entry.categories) ? entry.categories.filter(name => typeof name === 'string') : [];
      entry.summary = entry.protected ? '' : String(entry.summary || '');
      entry.date = String(entry.date || ''); return true;
    } catch { return false; }
  });
  const json = async url => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 10000);
    try { const response = await fetch(url, { signal: controller.signal }); if (!response.ok) throw new Error('Index unavailable'); return await response.json(); }
    finally { clearTimeout(timer); }
  };
  const ensureBodies = () => {
    if (!shards.length || scope !== 'all' || !words().length) return bodyLoading;
    if (bodyLoading) { restartBodies = true; return bodyLoading; }
    const query = input.value;
    const keywords = words();
    restartBodies = false;
    if (service) service.textContent = t("正在加载正文搜索…");
    bodyLoading = (async () => {
      let selected = shards;
      if (indexVersion === 3) {
        try {
          const engine = await core(), terms = engine.queryTerms(keywords), postings = Object.create(null);
          const urls = [...new Set(terms.map(term => inverted.buckets[engine.bucketFor(term, inverted.count)]))];
          // Only the term buckets for this query are fetched, not the complete inverted index.
          const buckets = await Promise.all(urls.map(url => {
            if (!bucketCache.has(url)) bucketCache.set(url, json(url).catch(error => { bucketCache.delete(url); throw error; }));
            return bucketCache.get(url);
          }));
          if (buckets.some(bucket => !bucket || typeof bucket !== 'object' || Array.isArray(bucket))) throw new Error('Invalid keyword bucket');
          for (const bucket of buckets) for (const term of terms) if (Object.hasOwn(bucket, term)) postings[term] = bucket[term];
          const ids = new Set(await compute('candidates', { terms, postings }));
          const needed = new Set(entries.filter(entry => ids.has(entry.id) && !entry.protected).map(entry => entry.shard));
          selected = shards.filter((url, index) => needed.has(index));
        } catch { if (service) service.textContent = t("索引分片暂不可用，已回退为完整正文搜索。"); }
      }
      if (input.value !== query || scope !== 'all') { restartBodies = true; return; }
      const pending = selected.filter(url => !loadedShards.has(url));
      let cursor = 0;
      const worker = async () => {
        while (cursor < pending.length) {
          if (input.value !== query || scope !== 'all') { restartBodies = true; break; }
          const url = pending[cursor++], data = await json(url);
          if (!Array.isArray(data)) throw new Error('Invalid shard');
          const byURL = new Map(normalize(data).map(entry => [entry.url, entry]));
          entries = entries.map(entry => {
            const incoming = byURL.get(entry.url);
            return incoming ? { ...entry, ...incoming, ...(entry.protected ? { protected: true, content: '', summary: '', topics: '', categories: [] } : {}) } : entry;
          });
          entriesRevision++; loadedShards.add(url); render();
        }
      };
      const workers = await Promise.allSettled([worker(), worker()]);
      if (workers.some(result => result.status === 'rejected')) {
        if (service) service.textContent = t("部分正文未能加载，当前结果可能不完整。");
        if (retry) retry.hidden = false;
      } else {
        if (service) service.textContent = t("全文索引已就绪 · 空格分隔多个关键词");
        if (retry) retry.hidden = true;
      }
      render();
    })().finally(() => { bodyLoading = null; if (restartBodies) ensureBodies(); });
    return bodyLoading;
  };
  const load = () => {
    if (loaded || loading || !dialog.dataset.searchIndex) return loading;
    if (service) service.textContent = t("正在加载正文搜索…");
    if (retry) retry.hidden = true;
    results.setAttribute('aria-busy', 'true');
    loading = (async () => {
      try {
        const data = await json(dialog.dataset.searchIndex);
        if (Array.isArray(data)) entries = normalize(data);
        else if ([2, 3].includes(data?.version) && Array.isArray(data.entries) && Array.isArray(data.shards)) {
          entries = normalize(data.entries);
          shards = data.shards.map(value => new URL(value, location.href)).filter(url => url.origin === location.origin && /^https?:$/.test(url.protocol)).map(url => url.href);
          if (shards.length !== data.shards.length || shards.length > 1000) throw new Error('Invalid manifest');
          indexVersion = data.version;
          if (indexVersion === 3) {
            const info = data.inverted;
            if (!info || !Number.isInteger(info.count) || info.count < 1 || info.count > 256 || !Array.isArray(info.buckets) || info.buckets.length !== info.count || !entries.every(entry => Number.isInteger(entry.id) && entry.id >= 0 && Number.isInteger(entry.shard) && entry.shard >= 0 && entry.shard < shards.length)) throw new Error('Invalid inverted index');
            const buckets = info.buckets.map(value => new URL(value, location.href));
            if (buckets.some(url => url.origin !== location.origin || !/^https?:$/.test(url.protocol))) throw new Error('Invalid inverted bucket');
            inverted = { count: info.count, buckets: buckets.map(url => url.href) };
          }
        } else throw new Error('Invalid index');
        entriesRevision++; updateCategories();
        loaded = true;
        dialog.dataset.searchReady = 'true';
        if (service) service.textContent = t("全文索引已就绪 · 空格分隔多个关键词");
        render(); ensureBodies();
      } catch {
        if (service) service.textContent = t("全文索引暂不可用，正在使用页面内标题、摘要和标签搜索");
        if (retry) retry.hidden = false;
      } finally {
        loading = null;
        results.setAttribute('aria-busy', 'false');
      }
    })();
    return loading;
  };
  dialog.addEventListener('morii:search-open', load);
  const refresh = () => { visible = pageSize; if (scroll) scroll.scrollTop = 0; render(); ensureBodies(); };
  input.addEventListener('input', refresh);
  category?.addEventListener('change', refresh);
  dialog.querySelectorAll('[data-search-scope]').forEach(button => button.addEventListener('click', () => {
    scope = button.dataset.searchScope;
    dialog.querySelectorAll('[data-search-scope]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    refresh(); input.focus();
  }));
  dialog.querySelectorAll('[data-search-term]').forEach(button => button.addEventListener('click', () => {
    input.value = button.dataset.searchTerm;
    scope = 'all';
    dialog.querySelectorAll('[data-search-scope]').forEach(item => item.setAttribute('aria-pressed', String(item.dataset.searchScope === 'all')));
    refresh(); input.focus();
  }));
  dialog.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target !== input && !event.target.closest?.('#search-results a')) return;
    const links = [...results.querySelectorAll('a')];
    if (!links.length) return;
    if (event.target === input && event.key === 'Enter' && words().length) { event.preventDefault(); links[0].click(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = links.indexOf(document.activeElement);
    if (event.key === 'ArrowUp' && index <= 0) { input.focus(); return; }
    links[Math.min(links.length - 1, event.key === 'ArrowDown' ? index + 1 : index - 1)].focus();
  });
  retry?.addEventListener('click', () => loaded ? ensureBodies() : load());
  more?.addEventListener('click', () => { visible += pageSize; render(); });
  clear?.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.focus();
  });
  render();
})();

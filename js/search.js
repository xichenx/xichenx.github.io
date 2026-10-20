(() => {
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
  let entries = [...results.querySelectorAll('li')].map(item => ({
    title: item.querySelector('strong')?.textContent || '',
    url: item.querySelector('a')?.href || '',
    content: item.dataset.protected === 'true' ? '' : item.querySelector('.search-result-summary')?.textContent || '',
    topics: item.dataset.topics || '',
    date: item.querySelector('small')?.textContent || '',
    protected: item.dataset.protected === 'true'
  }));
  let loaded = false;
  let scope = 'all';
  const scroll = dialog.querySelector('.search-scroll');
  const clear = document.getElementById('search-clear');
  const heading = document.getElementById('search-results-heading');
  let loading;
  let visible = pageSize;
  const words = () => [...new Set(input.value.trim().toLowerCase().split(/\s+/).filter(Boolean))].slice(0, 20);
  const highlight = (element, text, keywords) => {
    const lower = text.toLowerCase();
    let position = 0;
    while (position < text.length) {
      let start = text.length;
      let length = 0;
      keywords.forEach(word => {
        const found = lower.indexOf(word, position);
        if (found >= 0 && (found < start || (found === start && word.length > length))) { start = found; length = word.length; }
      });
      if (start > position) element.append(document.createTextNode(text.slice(position, start)));
      if (!length) break;
      const mark = document.createElement('mark');
      mark.textContent = text.slice(start, start + length);
      element.append(mark);
      position = start + length;
    }
  };
  const render = () => {
    const keywords = words();
    const matches = entries.map((entry, index) => {
      const title = entry.title.toLowerCase();
      const haystack = scope === 'title' ? title : scope === 'topics' ? entry.topics.toLowerCase() : `${title} ${entry.content.toLowerCase()} ${entry.topics.toLowerCase()}`;
      return { entry, index, match: keywords.every(word => haystack.includes(word)), score: keywords.reduce((sum, word) => sum + (title.includes(word) ? 3 : entry.topics.toLowerCase().includes(word) ? 1 : 0), 0) };
    }).filter(item => item.match).sort((a, b) => b.score - a.score || a.index - b.index);
    const focused = document.activeElement?.closest?.('#search-results a');
    const focusedUrl = focused?.href;
    results.replaceChildren(...matches.slice(0, visible).map(({ entry }) => {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = entry.url;
      const icon = document.createElement('span'); icon.className = 'search-result-icon'; icon.textContent = entry.protected ? '⌑' : '≡'; icon.setAttribute('aria-hidden', 'true');
      const body = document.createElement('div'); body.className = 'search-result-content';
      const title = document.createElement('strong'); title.className = 'search-result-title';
      highlight(title, entry.title, keywords);
      const summary = document.createElement('p');
      summary.className = 'search-result-summary';
      if (entry.protected) summary.textContent = '加密文章 · 输入密码后阅读全文';
      else {
        const lower = entry.content.toLowerCase();
        const offsets = keywords.map(word => lower.indexOf(word)).filter(index => index >= 0);
        const start = offsets.length ? Math.max(0, Math.min(...offsets) - 32) : 0;
        const text = entry.content.slice(start, start + 150);
        highlight(summary, `${start ? '…' : ''}${text}${start + 150 < entry.content.length ? '…' : ''}`, keywords);
      }
      const meta = document.createElement('small');
      meta.textContent = [entry.date, entry.protected ? '加密文章' : entry.topics].filter(Boolean).join(' · ');
      const arrow = document.createElement('span'); arrow.className = 'search-result-arrow'; arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true');
      body.append(title, summary, meta); link.append(icon, body, arrow);
      item.append(link);
      return item;
    }));
    if (focusedUrl) ([...results.querySelectorAll('a')].find(link => link.href === focusedUrl) || input).focus({ preventScroll: true });
    if (clear) clear.hidden = input.value.length === 0;
    if (heading) heading.textContent = keywords.length ? '搜索结果' : '最近文章';
    if (status) status.textContent = `${keywords.length ? '找到' : '共'} ${matches.length} 篇文章 · 已展示 ${Math.min(visible, matches.length)} 篇`;
    if (empty) empty.hidden = matches.length > 0;
    if (more) more.hidden = matches.length <= visible;
  };
  const load = () => {
    if (loaded || loading || !dialog.dataset.searchIndex) return loading;
    if (service) service.textContent = '正在加载正文搜索…';
    if (retry) retry.hidden = true;
    results.setAttribute('aria-busy', 'true');
    loading = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(dialog.dataset.searchIndex, { signal: controller.signal });
        if (!response.ok) throw new Error('Index unavailable');
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error('Invalid index');
        const seen = new Set();
        entries = data.filter(entry => {
          if (!entry || typeof entry.title !== 'string' || typeof entry.url !== 'string') return false;
          try {
            const url = new URL(entry.url, location.href);
            if (url.origin !== location.origin || !/^https?:$/.test(url.protocol) || seen.has(url.href)) return false;
            seen.add(url.href);
            entry.url = url.href;
            entry.content = entry.protected ? '' : String(entry.content || '');
            entry.topics = entry.protected ? '' : String(entry.topics || '');
            entry.date = String(entry.date || '');
            return true;
          } catch { return false; }
        });
        loaded = true;
        dialog.dataset.searchReady = 'true';
        if (service) service.textContent = '全文索引已就绪 · 空格分隔多个关键词';
        render();
      } catch {
        if (service) service.textContent = '全文索引暂不可用，正在使用页面内标题、摘要和标签搜索';
        if (retry) retry.hidden = false;
      } finally {
        clearTimeout(timeout);
        loading = null;
        results.setAttribute('aria-busy', 'false');
      }
    })();
    return loading;
  };
  dialog.addEventListener('morii:search-open', load);
  const refresh = () => { visible = pageSize; if (scroll) scroll.scrollTop = 0; render(); };
  input.addEventListener('input', refresh);
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
  retry?.addEventListener('click', load);
  more?.addEventListener('click', () => { visible += pageSize; render(); });
  clear?.addEventListener('click', () => {
    input.value = '';
    input.dispatchEvent(new Event('input'));
    input.focus();
  });
  render();
})();

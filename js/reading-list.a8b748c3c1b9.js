(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  const key = 'morii-reading-list';
  const button = document.querySelector('[data-save-post]');
  const page = document.querySelector('[data-reading-list]');
  const message = document.getElementById('reading-list-message');
  const status = document.getElementById('reading-list-status');
  const grid = document.getElementById('reading-list-items');
  const retry = document.getElementById('reading-list-retry');
  const search = document.getElementById('reading-list-search');
  const progressOnly = document.getElementById('reading-list-progress-only');
  const progressSource = window.MoriiReadingProgress;
  const noMatch = document.getElementById('reading-list-no-match');
  const exportButton = document.getElementById('reading-list-export');
  const importButton = document.getElementById('reading-list-import');
  const importFile = document.getElementById('reading-list-import-file');
  const transferStatus = document.getElementById('reading-list-transfer-status');
  let metadata;
  let pending;
  let storageError = '';
  let loadError = '';
  const pathFor = value => {
    if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || /[\\\u0000-\u001f]/.test(value)) return '';
    try {
      const url = new URL(value, location.href);
      return url.origin === location.origin ? url.pathname.replace(/index\.html$/, '') : '';
    } catch { return ''; }
  };
  const read = () => {
    try {
      const data = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(data)) throw new Error('Invalid list');
      storageError = '';
      return [...new Set(data.map(pathFor).filter(Boolean))].slice(0, 100);
    } catch {
      storageError = t("无法读取本机收藏。请检查浏览器存储设置。");
      return [];
    }
  };
  const change = transform => {
    const current = read();
    const next = transform(current);
    if (!next) return false;
    try {
      localStorage.setItem(key, JSON.stringify(next));
      storageError = '';
      render();
      return true;
    } catch {
      const text = t("无法保存收藏，请检查浏览器是否允许网站存储。");
      if (message) message.textContent = text;
      if (status) status.textContent = text;
      return false;
    }
  };
  const render = () => {
    const saved = read();
    if (button) {
      const active = saved.includes(pathFor(button.dataset.savePost));
      button.hidden = false;
      button.setAttribute('aria-pressed', String(active));
      button.textContent = active ? t("已加入稍后阅读 ★") : t("加入稍后阅读 ☆");
      if (storageError && message) message.textContent = storageError;
    }
    if (!page || !grid) return;
    if (exportButton) exportButton.disabled = !saved.length || Boolean(storageError);
    document.getElementById('reading-list-empty').hidden = saved.length > 0 || Boolean(storageError);
    const progress = new Map();
    if (metadata && progressSource && saved.length) {
      for (const record of progressSource.read()) {
        const entry = metadata.get(record.path);
        if (entry?.updated && !entry.protected && entry.updated === record.updated) progress.set(record.path, record.ratio);
      }
    }
    if (progressOnly) {
      progressOnly.parentElement.hidden = !progressSource || !metadata || !saved.length;
      if (progressOnly.parentElement.hidden) progressOnly.checked = false;
    }
    const terms = (search?.value || '').trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const filtered = saved.filter(path => {
      const entry = metadata?.get(path);
      const text = `${entry?.title || ''} ${entry?.topics || ''} ${path}`.toLocaleLowerCase();
      return (!progressOnly?.checked || progress.has(path)) && terms.every(term => text.includes(term));
    });
    if (noMatch) noMatch.hidden = !saved.length || filtered.length > 0 || Boolean(storageError);
    const missing = saved.filter(path => !metadata?.has(path)).length;
    grid.replaceChildren(...filtered.map(path => {
      const entry = metadata?.get(path);
      const card = document.createElement('article');
      card.className = 'saved-card panel';
      const heading = document.createElement('h2');
      if (entry) {
        const link = document.createElement('a');
        link.href = path;
        link.textContent = entry.title;
        heading.append(link);
      } else heading.textContent = metadata ? t("暂未找到这篇文章") : t("正在等待文章信息");
      const description = document.createElement('p');
      description.textContent = entry ? `${entry.protected ? t("加密文章 · ") : ''}${entry.date || t("打开文章继续阅读")}` : path;
      if (progress.has(path)) description.textContent += ` · ${t("上次读到 {0}%", Math.round(progress.get(path) * 100))}`;
      const actions = document.createElement('div');
      actions.className = 'saved-card__actions';
      if (entry) {
        const link = document.createElement('a');
        link.className = 'text-link';
        link.href = path;
        link.textContent = t("继续阅读 →");
        actions.append(link);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = t("移除");
      remove.setAttribute('aria-label', t("从稍后阅读移除{0}", entry?.title || t("此文章")));
      remove.addEventListener('click', () => { change(current => current.filter(item => item !== path)); });
      actions.append(remove);
      card.append(heading, description, actions);
      return card;
    }));
    if (status) status.textContent = storageError || loadError || `${terms.length || progressOnly?.checked ? t("找到 {0} / {1} 篇收藏", filtered.length, saved.length) : t("收藏了 {0} 篇文章", saved.length)}${metadata && missing ? t("，其中 {0} 篇暂未找到，记录仍保留。", missing) : '。'}`;
  };
  const load = () => {
    if (!page || pending || !read().length) return pending;
    grid.setAttribute('aria-busy', 'true');
    if (retry) retry.hidden = true;
    loadError = '';
    pending = (async () => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(page.dataset.index, { signal: controller.signal });
        if (!response.ok) throw new Error('Index unavailable');
        const data = await response.json();
        const entries = Array.isArray(data) ? data : data?.entries;
        if (!Array.isArray(entries)) throw new Error('Invalid index');
        metadata = new Map(entries.filter(entry => entry && pathFor(entry.url) && typeof entry.title === 'string').map(entry => [pathFor(entry.url), entry]));
      } catch {
        loadError = t("文章信息暂时无法加载，收藏记录仍保留，可稍后重试。");
        if (retry) retry.hidden = false;
      } finally {
        clearTimeout(timeout);
        pending = null;
        grid.setAttribute('aria-busy', 'false');
        render();
      }
    })();
    return pending;
  };
  button?.addEventListener('click', () => {
    const path = pathFor(button.dataset.savePost);
    if (!path) return;
    let added;
    const changed = change(current => {
      added = !current.includes(path);
      if (added && current.length >= 100) {
        if (message) message.textContent = t("收藏已达 100 篇，请先在稍后阅读中移除一些文章。");
        return null;
      }
      return added ? [path, ...current] : current.filter(item => item !== path);
    });
    if (changed && message) message.textContent = added ? t("已收藏，可以在稍后阅读中找到。") : t("已从稍后阅读移除。");
  });
  retry?.addEventListener('click', load);
  search?.addEventListener('input', render);
  progressOnly?.addEventListener('change', render);
  document.getElementById('reading-list-reset-filter')?.addEventListener('click', () => {
    if (progressOnly) progressOnly.checked = false;
    if (search) { search.value = ''; render(); search.focus(); }
  });
  exportButton?.addEventListener('click', () => {
    const items = read();
    if (storageError || !items.length) return;
    let url;
    try {
      const data = { format: 'morii-reading-list', version: 1, root: page.dataset.root || '/', exportedAt: new Date().toISOString(), items };
      url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `morii-reading-list-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      if (transferStatus) transferStatus.textContent = t("已导出 {0} 篇收藏。备份包含文章路径，不包含正文或阅读进度。", items.length);
    } catch {
      if (transferStatus) transferStatus.textContent = t("无法导出收藏，请检查浏览器是否允许下载文件。");
    } finally {
      if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
  });
  importButton?.addEventListener('click', () => importFile?.click());
  importFile?.addEventListener('change', async () => {
    const file = importFile.files?.[0];
    if (!file) return;
    if (importButton) importButton.disabled = true;
    try {
      if (file.size > 256 * 1024) throw new Error(t("文件过大，请选择 256 KB 以内的 Morii 收藏备份。"));
      let data;
      try { data = JSON.parse(await file.text()); }
      catch { throw new Error(t("无法读取备份，请选择有效的 JSON 文件。")); }
      if (data?.format !== 'morii-reading-list' || data.version !== 1 || !Array.isArray(data.items) || data.items.length > 1000) throw new Error(t("这不是支持的 Morii 收藏备份，现有收藏未更改。"));
      const sourceRoot = data.root;
      if (typeof sourceRoot !== 'string' || !sourceRoot.startsWith('/') || sourceRoot.startsWith('//') || !sourceRoot.endsWith('/') || sourceRoot.length > 256 || /[?#\\\u0000-\u001f]/.test(sourceRoot) || new URL(sourceRoot, location.href).pathname !== sourceRoot) throw new Error(t("备份中的站点路径无效，现有收藏未更改。"));
      const current = read();
      if (storageError) throw new Error(t("无法读取现有收藏，未进行导入，请检查浏览器存储设置。"));
      const merged = [...current];
      let added = 0; let duplicates = 0; let invalid = 0; let overflow = 0;
      for (const item of data.items) {
        const normalized = pathFor(item);
        if (!normalized || !normalized.startsWith(sourceRoot)) { invalid++; continue; }
        const path = pathFor(`${page.dataset.root || '/'}${normalized.slice(sourceRoot.length)}`);
        if (!path) { invalid++; continue; }
        if (merged.includes(path)) { duplicates++; continue; }
        if (merged.length >= 100) { overflow++; continue; }
        merged.push(path); added++;
      }
      if (!change(() => merged)) throw new Error(t("无法保存导入结果，请检查浏览器存储设置。"));
      if (transferStatus) transferStatus.textContent = t("已新增 {0} 篇收藏{1}{2}{3}。", added, duplicates ? t("，跳过 {0} 个重复项", duplicates) : '', invalid ? t("，忽略 {0} 个无效路径", invalid) : '', overflow ? t("，{0} 篇因达到 100 篇上限未导入", overflow) : '');
      if (!metadata) load();
    } catch (error) {
      if (transferStatus) transferStatus.textContent = error.message || t("导入失败，现有收藏未更改。");
    } finally {
      importFile.value = '';
      if (importButton) importButton.disabled = false;
    }
  });
  window.addEventListener('storage', event => {
    if (progressSource && event.key === progressSource.key) { render(); return; }
    if (event.key !== key && event.key !== null) return;
    render();
    if (!metadata) load();
  });
  if (progressSource) window.addEventListener('pageshow', event => { if (event.persisted) render(); });
  render();
  load();
})();

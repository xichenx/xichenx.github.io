(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  const article = document.querySelector('.article-body');
  if (!article) return;
  const updateOutdatedNotice = () => {
    document.querySelectorAll('.outdated-notice[data-updated]').forEach(notice => {
      const updated = Date.parse(notice.dataset.updated);
      const days = Math.max(0, Math.floor((Date.now() - updated) / 86400000));
      notice.hidden = !Number.isFinite(days) || days <= Number(notice.dataset.daysLimit);
      const count = notice.querySelector('[data-outdated-days]');
      if (count && Number.isFinite(days)) count.textContent = String(days);
    });
  };
  updateOutdatedNotice();
  window.addEventListener('pageshow', updateOutdatedNotice);
  const tocContainers = [...document.querySelectorAll('.toc-content')];
  const tocFilters = tocContainers.flatMap(toc => {
    const controls = toc.previousElementSibling;
    const input = controls?.querySelector('[data-toc-query]');
    if (!input) return [];
    const status = controls.querySelector('.toc-filter__status');
    const normalize = value => value.normalize('NFKC').toLowerCase();
    const apply = () => {
      const links = [...toc.querySelectorAll('a')];
      controls.hidden = links.length < 10;
      const terms = controls.hidden ? [] : normalize(input.value).trim().split(/\s+/).filter(Boolean);
      toc.classList.toggle('is-filtered', terms.length > 0);
      let matches = 0;
      for (const link of links) {
        const title = normalize(link.textContent);
        link.hidden = !terms.every(term => title.includes(term));
        if (!link.hidden) matches++;
      }
      status.hidden = !terms.length || matches > 0;
    };
    input.addEventListener('input', () => {
      apply();
      toc.scrollTop = 0;
    });
    input.addEventListener('keydown', event => {
      if (event.isComposing || event.key !== 'ArrowDown') return;
      const first = toc.querySelector('a:not([hidden])');
      if (!first) return;
      event.preventDefault();
      first.focus();
    });
    return [apply];
  });
  const progress = document.querySelector('.reading-progress');
  const progressBar = document.querySelector('.reading-progress__bar');
  const headerTitle = document.querySelector('.header-post-title');
  const siteHeader = headerTitle?.closest('.site-header');
  const brandCopy = siteHeader?.querySelector('.brand__copy');
  const articleTitle = headerTitle && document.querySelector('.article-header h1');
  const announcement = document.getElementById('theme-announcement');
  let headings = [];
  let tocLinks = [];
  let frame;
  let blockIndex = 0;
  const tocDialog = document.getElementById('reading-toc-dialog');
  const tocTrigger = document.querySelector('[data-reading-toc]');
  if (tocDialog && tocTrigger && typeof tocDialog.showModal === 'function') {
    document.documentElement.classList.add('toc-enhanced');
    tocTrigger.hidden = false;
    tocTrigger.addEventListener('click', () => {
      if (document.documentElement.dataset.printPreview === 'true' || document.querySelector('dialog[open]')) return;
      tocDialog.showModal();
      const current = tocDialog.querySelector('[aria-current]');
      if (current && !current.hidden) current.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
    });
    document.getElementById('reading-toc-close')?.addEventListener('click', () => tocDialog.close());
    tocDialog.addEventListener('click', event => { if (event.target === tocDialog) tocDialog.close(); });
    tocDialog.addEventListener('close', () => tocTrigger.focus({ preventScroll: true }));
  }
  const configuredLines = Math.floor(Number(article.dataset.codeLines) || 18);
  const collapseLines = Math.max(5, Math.min(100, configuredLines));
  const collapseHeight = Number(article.dataset.codeHeightLimit);
  const heightFolds = new Map();
  let codeLayoutChanged = false;
  const codeText = code => {
    const clone = code.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    return clone.textContent;
  };

  const updateProgress = () => {
    frame = null;
    if (codeLayoutChanged) {
      codeLayoutChanged = false;
      for (const [block, sync] of heightFolds) {
        if (article.contains(block)) sync();
        else heightFolds.delete(block);
      }
    }
    const start = article.getBoundingClientRect().top + window.scrollY - 130;
    const distance = article.offsetHeight - window.innerHeight + 160;
    const value = Math.round(Math.max(0, Math.min(100, (window.scrollY - start) / Math.max(1, distance) * 100)));
    if (articleTitle && brandCopy) {
      const showTitle = articleTitle.getBoundingClientRect().bottom <= siteHeader.getBoundingClientRect().bottom;
      if (headerTitle.hidden === showTitle) {
        headerTitle.hidden = !showTitle;
        brandCopy.hidden = showTitle;
      }
    }
    progress?.setAttribute('aria-valuenow', String(value));
    if (progressBar) progressBar.style.transform = `scaleX(${value / 100})`;
    document.querySelectorAll('[data-reading-percent]').forEach(label => { label.textContent = `${value}%`; });
    let active = headings[0];
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top > 150) break;
      active = heading;
    }
    tocLinks.forEach(link => {
      if (active && link.hash === `#${encodeURIComponent(active.id)}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
    // Keep a long desktop outline in view without moving the article itself.
    const desktopToc = document.querySelector('.reading-aside .toc-content');
    const currentLink = desktopToc?.querySelector('[aria-current]');
    if (currentLink && !desktopToc.classList.contains('is-filtered')) {
      const container = desktopToc.getBoundingClientRect();
      const current = currentLink.getBoundingClientRect();
      if (current.top < container.top || current.bottom > container.bottom) {
        desktopToc.scrollTop += current.top - container.top - desktopToc.clientHeight / 2 + current.height / 2;
      }
    }
  };
  const scheduleProgress = () => { if (!frame) frame = requestAnimationFrame(updateProgress); };
  const updateArticleLayout = () => {
    codeLayoutChanged = heightFolds.size > 0;
    scheduleProgress();
  };

  const copyText = async (text, button) => {
    const label = button.textContent;
    button.disabled = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable');
      await navigator.clipboard.writeText(text);
      button.textContent = t("已复制");
      if (announcement) announcement.textContent = t("已复制到剪贴板");
    } catch {
      button.textContent = t("请手动选择并复制");
      if (announcement) announcement.textContent = t("无法访问剪贴板，请手动选择并复制");
    } finally {
      setTimeout(() => { button.textContent = label; button.disabled = false; }, 2200);
    }
  };

  const addCodeViewer = (shell, tools, block) => {
    if (typeof window.HTMLDialogElement?.prototype.showModal !== 'function') return;
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'code-view';
    trigger.textContent = t("放大查看");
    trigger.setAttribute('aria-haspopup', 'dialog');
    tools.append(trigger);

    trigger.addEventListener('click', () => {
      if (document.querySelector('dialog[open]') || document.documentElement.dataset.printPreview === 'true') return;
      const dialog = document.createElement('dialog');
      dialog.className = 'code-dialog';
      dialog.setAttribute('aria-label', t("代码阅读窗口"));
      const close = document.createElement('button');
      close.type = 'button';
      close.className = 'code-dialog-close';
      close.textContent = t("关闭代码阅读窗口");
      close.autofocus = true;
      const content = document.createElement('div');
      content.className = 'code-dialog-content';
      content.tabIndex = 0;
      content.setAttribute('role', 'region');
      content.setAttribute('aria-label', t("代码内容"));

      const restore = () => {
        if (!dialog.isConnected) return;
        window.removeEventListener('beforeprint', print);
        shell.prepend(tools, block);
        dialog.remove();
        shell.style.removeProperty('min-height');
        trigger.focus({ preventScroll: true });
        updateArticleLayout();
      };
      const print = () => {
        dialog.close();
        restore();
      };
      dialog.addEventListener('close', restore, { once: true });
      close.addEventListener('click', () => dialog.close());
      shell.style.minHeight = `${shell.getBoundingClientRect().height}px`;
      content.append(block);
      dialog.append(close, tools, content);
      shell.append(dialog);
      dialog.showModal();
      window.addEventListener('beforeprint', print, { once: true });
    });
  };

  const enhanceArticle = () => {
    headings = [...article.querySelectorAll('h1, h2, h3, h4, h5, h6')];
    const baseLevel = Math.min(...headings.map(heading => Number(heading.tagName.slice(1))));
    headings.forEach((heading, index) => {
      if (heading.id) return;
      let id = `article-section-${index + 1}`;
      while (document.getElementById(id)) id += '-';
      heading.id = id;
    });
    tocContainers.forEach(toc => {
      if (!headings.length) { toc.textContent = t("这篇文章暂无目录"); return; }
      toc.replaceChildren(...headings.map(heading => {
        const link = document.createElement('a');
        link.href = `#${encodeURIComponent(heading.id)}`;
        const label = heading.cloneNode(true);
        label.querySelectorAll('.headerlink').forEach(anchor => anchor.remove());
        link.textContent = label.textContent;
        const depth = Number(heading.tagName.slice(1)) - baseLevel;
        if (depth > 0) link.className = depth > 1 ? 'toc-sub toc-deep' : 'toc-sub';
        return link;
      }));
    });
    tocLinks = tocContainers.flatMap(toc => [...toc.querySelectorAll('a')]);
    tocFilters.forEach(apply => apply());
    tocLinks.forEach(link => link.addEventListener('click', () => {
      const mobile = link.closest('.mobile-toc');
      if (mobile) mobile.open = false;
      if (tocDialog?.open && tocDialog.contains(link)) tocDialog.close();
    }));

    const blocks = [...article.querySelectorAll('figure.highlight'), ...article.querySelectorAll('pre')].filter(block => !block.matches('.morii-diagram-source') && (block.matches('figure.highlight') || !block.closest('figure.highlight')));
    blocks.forEach(block => {
      if (block.dataset.copyReady) return;
      block.dataset.copyReady = 'true';
      const code = block.matches('pre') ? block : block.querySelector('.code pre') || block.querySelector('pre');
      if (!code) return;
      const shell = document.createElement('div');
      shell.className = 'code-shell';
      const file = block.closest('.code-file');
      const choice = (name, allowed, fallback) => allowed.includes(file?.dataset[name]) ? file.dataset[name] : allowed.includes(article.dataset[name]) ? article.dataset[name] : fallback;
      shell.dataset.codeStyle = choice('codeStyle', ['classic', 'mac', 'minimal'], 'classic');
      shell.dataset.codeTheme = choice('codeTheme', ['auto', 'light', 'dark'], 'dark');
      block.before(shell);
      const tools = document.createElement('div');
      tools.className = 'code-tools';
      const languageClass = [...(code.querySelector('code')?.classList || [])].find(name => name.startsWith('language-'));
      if (article.dataset.codeLanguage !== 'false') {
        const language = document.createElement('span');
        language.textContent = languageClass?.replace('language-', '') || [...block.classList].find(name => !['highlight', 'plaintext'].includes(name)) || 'CODE';
        tools.append(language);
      }
      const filename = file?.dataset.filename;
      if (filename) { const label = document.createElement('strong'); label.className = 'code-filename'; label.textContent = filename; tools.append(label); }
      if (article.dataset.codeCopy !== 'false') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'code-copy';
        button.textContent = t("复制代码");
        button.setAttribute('aria-label', t("复制代码"));
        button.addEventListener('click', () => copyText(codeText(code), button));
        tools.append(button);
      }
      const wrap = document.createElement('button');
      wrap.type = 'button';
      wrap.className = 'code-wrap';
      wrap.textContent = t("自动换行");
      const syncWrap = () => wrap.setAttribute('aria-pressed', String(shell.classList.contains('is-wrapped')));
      shell.classList.toggle('is-wrapped', article.dataset.codeWordWrap === 'true');
      syncWrap();
      wrap.addEventListener('click', () => {
        shell.classList.toggle('is-wrapped');
        syncWrap();
        heightFolds.get(block)?.();
        scheduleProgress();
      });
      tools.append(wrap);
      if (article.dataset.codeViewer !== 'false' && !block.classList.contains('mermaid') && languageClass !== 'language-mermaid') {
        addCodeViewer(shell, tools, block);
      }
      shell.append(tools, block);
      const lineCount = codeText(code).replace(/\n$/, '').split('\n').length;
      if (article.dataset.codeCollapse !== 'false' && (collapseHeight || lineCount > collapseLines)) {
        let blockId;
        do { blockId = `morii-code-${++blockIndex}`; } while (document.getElementById(blockId));
        if (!block.id) block.id = blockId;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'code-toggle';
        toggle.setAttribute('aria-controls', block.id);
        let previewHeight = collapseHeight;
        if (!previewHeight) {
          const codeStyle = getComputedStyle(code);
          const lineHeight = parseFloat(codeStyle.lineHeight) || 20.8;
          const padding = (parseFloat(codeStyle.paddingTop) || 0) + (parseFloat(codeStyle.paddingBottom) || 0);
          previewHeight = collapseLines * lineHeight + padding;
        }
        shell.style.setProperty('--code-preview-height', `${previewHeight}px`);
        let collapsed = article.dataset.codeStartCollapsed !== 'false';
        const sync = () => {
          if (block.parentElement !== shell) return;
          const canFold = !collapseHeight || block.scrollHeight > collapseHeight;
          const expanded = !(canFold && collapsed);
          if (toggle.hidden === canFold) toggle.hidden = !canFold;
          shell.classList.toggle('is-collapsed', !expanded);
          if (toggle.getAttribute('aria-expanded') === String(expanded)) return;
          toggle.setAttribute('aria-expanded', String(expanded));
          toggle.textContent = expanded ? t("收起代码 ↑") : t("展开全部 {0} 行代码 ↓", lineCount);
        };
        toggle.addEventListener('click', () => {
          collapsed = !collapsed;
          sync();
          if (shell.classList.contains('is-collapsed') && shell.getBoundingClientRect().top < 80) shell.scrollIntoView?.({ block: 'start', behavior: 'auto' });
          scheduleProgress();
        });
        shell.append(toggle);
        if (collapseHeight) heightFolds.set(block, sync);
        sync();
      }
    });
    scheduleProgress();
  };

  document.getElementById('copy-article-link')?.addEventListener('click', event => {
    const canonical = document.querySelector('link[rel="canonical"]')?.href || location.href.split('#')[0];
    copyText(canonical, event.currentTarget);
  });
  enhanceArticle();
  window.addEventListener('hexo-blog-decrypt', enhanceArticle);
  window.addEventListener('scroll', scheduleProgress, { passive: true });
  window.addEventListener('resize', updateArticleLayout);
  window.addEventListener('load', updateArticleLayout);
  window.addEventListener('pageshow', updateArticleLayout);
  if (typeof ResizeObserver === 'function') new ResizeObserver(updateArticleLayout).observe(article);
})();

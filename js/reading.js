(() => {
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
  const progress = document.querySelector('.reading-progress');
  const progressBar = document.querySelector('.reading-progress__bar');
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
      current?.scrollIntoView?.({ block: 'nearest', behavior: 'instant' });
    });
    document.getElementById('reading-toc-close')?.addEventListener('click', () => tocDialog.close());
    tocDialog.addEventListener('click', event => { if (event.target === tocDialog) tocDialog.close(); });
    tocDialog.addEventListener('close', () => tocTrigger.focus({ preventScroll: true }));
  }
  const configuredLines = Math.floor(Number(article.dataset.codeLines) || 18);
  const collapseLines = Math.max(5, Math.min(100, configuredLines));
  const codeText = code => {
    const clone = code.cloneNode(true);
    clone.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
    return clone.textContent;
  };

  const updateProgress = () => {
    frame = null;
    const start = article.getBoundingClientRect().top + window.scrollY - 130;
    const distance = article.offsetHeight - window.innerHeight + 160;
    const value = Math.round(Math.max(0, Math.min(100, (window.scrollY - start) / Math.max(1, distance) * 100)));
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
    if (currentLink) {
      const container = desktopToc.getBoundingClientRect();
      const current = currentLink.getBoundingClientRect();
      if (current.top < container.top || current.bottom > container.bottom) {
        desktopToc.scrollTop += current.top - container.top - desktopToc.clientHeight / 2 + current.height / 2;
      }
    }
  };
  const scheduleProgress = () => { if (!frame) frame = requestAnimationFrame(updateProgress); };

  const copyText = async (text, button) => {
    const label = button.textContent;
    button.disabled = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable');
      await navigator.clipboard.writeText(text);
      button.textContent = '已复制';
      if (announcement) announcement.textContent = '已复制到剪贴板';
    } catch {
      button.textContent = '请手动选择并复制';
      if (announcement) announcement.textContent = '无法访问剪贴板，请手动选择并复制';
    } finally {
      setTimeout(() => { button.textContent = label; button.disabled = false; }, 2200);
    }
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
      if (!headings.length) { toc.textContent = '这篇文章暂无目录'; return; }
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
    tocLinks.forEach(link => link.addEventListener('click', () => {
      const mobile = link.closest('.mobile-toc');
      if (mobile) mobile.open = false;
      if (tocDialog?.open && tocDialog.contains(link)) tocDialog.close();
    }));

    const blocks = [...article.querySelectorAll('figure.highlight'), ...article.querySelectorAll('pre')].filter(block => block.matches('figure.highlight') || !block.closest('figure.highlight'));
    blocks.forEach(block => {
      if (block.dataset.copyReady) return;
      block.dataset.copyReady = 'true';
      const code = block.matches('pre') ? block : block.querySelector('.code pre') || block.querySelector('pre');
      if (!code) return;
      const shell = document.createElement('div');
      shell.className = 'code-shell';
      block.before(shell);
      const tools = document.createElement('div');
      tools.className = 'code-tools';
      const language = document.createElement('span');
      const languageClass = [...(code.querySelector('code')?.classList || [])].find(name => name.startsWith('language-'));
      language.textContent = languageClass?.replace('language-', '') || [...block.classList].find(name => !['highlight', 'plaintext'].includes(name)) || 'CODE';
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = '复制代码';
      button.setAttribute('aria-label', '复制代码');
      button.addEventListener('click', () => {
        copyText(codeText(code), button);
      });
      tools.append(language, button);
      shell.append(tools, block);
      const lineCount = codeText(code).replace(/\n$/, '').split('\n').length;
      if (article.dataset.codeCollapse !== 'false' && lineCount > collapseLines) {
        let blockId;
        do { blockId = `morii-code-${++blockIndex}`; } while (document.getElementById(blockId));
        if (!block.id) block.id = blockId;
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'code-toggle';
        toggle.setAttribute('aria-controls', block.id);
        shell.classList.add('is-collapsed');
        const codeStyle = getComputedStyle(code);
        const lineHeight = parseFloat(codeStyle.lineHeight) || 20.8;
        const padding = (parseFloat(codeStyle.paddingTop) || 0) + (parseFloat(codeStyle.paddingBottom) || 0);
        shell.style.setProperty('--code-preview-height', `${collapseLines * lineHeight + padding}px`);
        const sync = () => {
          const expanded = !shell.classList.contains('is-collapsed');
          toggle.setAttribute('aria-expanded', String(expanded));
          toggle.textContent = expanded ? '收起代码 ↑' : `展开全部 ${lineCount} 行代码 ↓`;
        };
        toggle.addEventListener('click', () => {
          shell.classList.toggle('is-collapsed');
          sync();
          if (shell.classList.contains('is-collapsed') && shell.getBoundingClientRect().top < 80) shell.scrollIntoView?.({ block: 'start', behavior: 'auto' });
          scheduleProgress();
        });
        sync();
        shell.append(toggle);
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
  window.addEventListener('resize', scheduleProgress);
  window.addEventListener('load', scheduleProgress);
  if (typeof ResizeObserver === 'function') new ResizeObserver(scheduleProgress).observe(article);
})();

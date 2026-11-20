(async () => {
  const script = document.currentScript;
  const article = document.querySelector('.article-body');
  if (!article || !script) return;
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0];
  const scriptLoad = url => new Promise((resolve, reject) => {
    const node = document.createElement('script'); node.src = url; node.async = true;
    const timer = setTimeout(() => { node.remove(); reject(new Error('Timeout')); }, 15000);
    node.onload = () => { clearTimeout(timer); resolve(); }; node.onerror = () => { clearTimeout(timer); node.remove(); reject(new Error('Unavailable')); };
    document.head.append(node);
  });
  const error = (element, retry) => {
    let button = element.nextElementSibling?.matches('.enhancement-retry') ? element.nextElementSibling : null;
    if (button) return;
    button = document.createElement('button'); button.className = 'enhancement-retry'; button.type = 'button'; button.textContent = t("渲染失败，点击重试");
    button.addEventListener('click', () => { button.remove(); retry(); }); element.after(button);
  };
  let mermaid;
  let diagramSerial = 0;
  let diagramPending = false;
  let redraw = false;
  const diagrams = [];
  const theme = () => document.documentElement.dataset.theme === 'dark' ? 'dark' : 'default';
  const renderDiagrams = async () => {
    if (diagramPending) { redraw = true; return; }
    for (const node of article.querySelectorAll('.morii-diagram-source, figure.highlight.mermaid .code pre, pre code.language-mermaid')) {
      if (node.dataset.diagramQueued) continue;
      node.dataset.diagramQueued = 'true';
      const root = node.closest('.code-shell') || node.closest('figure.highlight') || (node.matches('code') ? node.parentElement : node);
      diagrams.push({ root, code: node.textContent, theme: null });
    }
    const active = diagrams.filter(item => item.root.isConnected && item.theme !== theme());
    if (!active.length) return;
    diagramPending = true;
    const selectedTheme = theme();
    try {
      mermaid = window.mermaid || mermaid || (await import(script.dataset.mermaid)).default;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: selectedTheme });
      for (const item of active) {
        try {
          const { svg } = await mermaid.render(`morii-diagram-${++diagramSerial}`, item.code);
          if (!item.root.isConnected) continue;
          const figure = document.createElement('figure'); figure.className = 'article-diagram';
          const image = document.createElement('div'); image.className = 'article-diagram-image'; image.innerHTML = svg;
          const source = document.createElement('details'); source.open = item.root.querySelector('details')?.open || false;
          const summary = document.createElement('summary'); summary.textContent = t("查看图表源码");
          const pre = document.createElement('pre'); pre.textContent = item.code;
          source.append(summary, pre); figure.append(image, source);
          if (item.root.nextElementSibling?.matches('.enhancement-retry')) item.root.nextElementSibling.remove();
          item.root.replaceWith(figure); item.root = figure; item.theme = selectedTheme;
        } catch { error(item.root, renderDiagrams); }
      }
    } catch { active.forEach(item => error(item.root, renderDiagrams)); }
    finally { diagramPending = false; if (redraw) { redraw = false; renderDiagrams(); } }
  };
  let mathLoad;
  const loadMath = () => {
    if (window.katex?.render) return;
    if (!mathLoad) {
      if (!document.querySelector('[data-morii-math-style]')) {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = script.dataset.mathCss;
        css.dataset.moriiMathStyle = '';
        document.head.append(css);
      }
      mathLoad = scriptLoad(script.dataset.math).finally(() => { mathLoad = undefined; });
    }
    return mathLoad;
  };
  const renderMath = async () => {
    const formulas = [...article.querySelectorAll('.morii-math:not([data-rendered])')];
    if (!formulas.length) return;
    try {
      await loadMath();
      for (const element of formulas) {
        if (!element.isConnected || element.dataset.rendered) continue;
        try {
          window.katex.render(element.textContent, element, { displayMode: element.dataset.display !== 'false', throwOnError: true, trust: false, maxExpand: 1000 });
          element.dataset.rendered = 'true';
          if (element.nextElementSibling?.matches('.enhancement-retry')) element.nextElementSibling.remove();
        }
        catch { error(element, renderMath); }
      }
    } catch { formulas.filter(element => element.isConnected).forEach(element => error(element, renderMath)); }
  };
  const render = () => { if (script.dataset.mermaid) renderDiagrams(); if (script.dataset.math) renderMath(); };
  render();
  window.addEventListener('hexo-blog-decrypt', render);
  if (script.dataset.mermaid) {
    const observer = new MutationObserver(() => renderDiagrams());
    const observe = () => observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    observe();
    window.addEventListener('pagehide', () => observer.disconnect());
    window.addEventListener('pageshow', () => { observe(); renderDiagrams(); });
  }
})();

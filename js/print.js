(() => {
  const stylesheet = document.getElementById('article-print-style');
  const toolbar = document.getElementById('article-print-toolbar');
  const article = document.querySelector('.article-body');
  if (!stylesheet || !toolbar || !article) return;
  const triggers = [...document.querySelectorAll('[data-preview-print]')];
  let active = false;
  let opener;
  let scrollPosition = 0;
  let detailsState;
  const prepareDetails = () => {
    if (detailsState) return;
    detailsState = [...article.querySelectorAll('details')].map(details => [details, details.open]);
    detailsState.forEach(([details]) => { details.open = true; });
  };
  const restoreDetails = () => {
    detailsState?.forEach(([details, open]) => { details.open = open; });
    detailsState = null;
  };
  const close = () => {
    if (!active) return;
    active = false;
    delete document.documentElement.dataset.printPreview;
    stylesheet.media = 'print';
    toolbar.hidden = true;
    restoreDetails();
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    window.scrollTo({ top: scrollPosition, behavior: 'instant' });
    window.dispatchEvent(new Event('resize'));
  };
  triggers.forEach(button => {
    button.hidden = false;
    button.addEventListener('click', () => {
      if (active) return;
      active = true;
      document.documentElement.dataset.printPreview = 'true';
      opener = button;
      scrollPosition = window.scrollY;
      prepareDetails();
      stylesheet.media = 'all';
      toolbar.hidden = false;
      window.scrollTo({ top: 0, behavior: 'instant' });
      document.getElementById('print-article')?.focus();
    });
  });
  document.getElementById('exit-print-preview')?.addEventListener('click', close);
  document.getElementById('print-article')?.addEventListener('click', () => {
    try { window.print(); }
    catch { document.getElementById('print-status').textContent = '当前浏览器无法打开打印窗口，请使用浏览器菜单中的打印功能。'; }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && active) { event.preventDefault(); close(); }
  });
  window.addEventListener('beforeprint', prepareDetails);
  window.addEventListener('afterprint', () => { if (!active) restoreDetails(); });
})();

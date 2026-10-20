(() => {
  const dialog = document.getElementById('navigation-dialog');
  const button = document.getElementById('navigation-open');
  if (!dialog || !button) return;
  let opener;
  const open = () => {
    if (document.documentElement.dataset.printPreview === 'true') return;
    if (dialog.open) return;
    if (document.querySelector('dialog[open]')) return;
    opener = document.activeElement;
    document.getElementById('menu-toggle')?.setAttribute('aria-expanded', 'false');
    document.getElementById('menu-toggle')?.setAttribute('aria-label', '打开菜单');
    document.querySelector('.site-nav')?.classList.remove('is-open');
    dialog.showModal();
    button.setAttribute('aria-expanded', 'true');
    document.getElementById('navigation-close')?.focus();
  };
  button.addEventListener('click', open);
  document.getElementById('navigation-close')?.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => {
    button.setAttribute('aria-expanded', 'false');
    if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && dialog.open) { event.preventDefault(); dialog.close(); return; }
    if (event.key !== '?' || event.ctrlKey || event.metaKey || event.altKey || event.repeat || event.isComposing) return;
    const target = event.target instanceof Element ? event.target : document.activeElement;
    if (target?.closest('input, textarea, select, [role="textbox"], [contenteditable]:not([contenteditable="false"])')) return;
    if (document.querySelector('dialog[open]')) return;
    event.preventDefault();
    open();
  });
})();

(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  const dialog = document.getElementById('navigation-dialog');
  const button = document.getElementById('navigation-open');
  if (!dialog || !button) return;
  const syncControls = () => {
    dialog.querySelectorAll('[data-control]').forEach(control => {
      const target = document.getElementById(control.dataset.control);
      control.disabled = !target || target.disabled;
      if (control.hasAttribute('aria-pressed')) control.setAttribute('aria-pressed', control.dataset.control === 'theme-toggle' ? String(document.documentElement.dataset.theme === 'dark') : target?.getAttribute('aria-pressed') || 'false');
    });
    const bookmark = dialog.querySelector('[data-control-bookmark]');
    if (bookmark) { const target = document.querySelector('[data-save-post]'); bookmark.disabled = !target || target.hidden; bookmark.setAttribute('aria-pressed', target?.getAttribute('aria-pressed') || 'false'); }
    const font = dialog.querySelector('[data-control-font]');
    if (font) font.textContent = document.getElementById('reading-font-value')?.textContent || '17 px';
  };
  dialog.querySelectorAll('[data-control]').forEach(control => control.addEventListener('click', () => {
    document.getElementById(control.dataset.control)?.click(); syncControls();
  }));
  const bookmark = dialog.querySelector('[data-control-bookmark]');
  bookmark?.addEventListener('click', () => {
    document.querySelector('[data-save-post]')?.click();
    bookmark.setAttribute('aria-pressed', document.querySelector('[data-save-post]')?.getAttribute('aria-pressed') || 'false');
  });
  const control = dialog.querySelector('[data-control-music]');
  let releaseMusic, pendingMusic, musicStyle;
  const connectMusic = () => {
    if (releaseMusic) return;
    const music = window.MoriiMusic;
    if (!music || !control) return;
    control.disabled = false;
    const unsubscribe = music.subscribe(state => {
      control.textContent = state.playing ? t("暂停音乐") : t("播放音乐");
      control.setAttribute('aria-pressed', String(state.playing));
      dialog.querySelector('[data-control-track]').textContent = state.tracks[state.current]?.title || t("未选择音乐");
    });
    releaseMusic = typeof unsubscribe === 'function' ? unsubscribe : () => {};
  };
  const loadMusic = () => {
    if (!control) return;
    if (!musicStyle && dialog.dataset.musicStyle) {
      const style = document.createElement('link');
      style.rel = 'stylesheet';
      style.href = dialog.dataset.musicStyle;
      style.onerror = () => { style.remove(); musicStyle = null; };
      musicStyle = style;
      document.head.append(style);
    }
    if (window.MoriiMusic) return connectMusic();
    if (!dialog.dataset.musicScript || pendingMusic) return;
    control.disabled = true;
    control.textContent = t("正在加载播放器…");
    const script = document.createElement('script');
    script.src = dialog.dataset.musicScript;
    const failed = () => {
      clearTimeout(timeout);
      if (pendingMusic !== script) return;
      pendingMusic = null;
      script.remove();
      control.disabled = false;
      control.textContent = t("重试");
    };
    const timeout = setTimeout(failed, 12000);
    script.onload = () => {
      if (pendingMusic !== script || !window.MoriiMusic) return failed();
      clearTimeout(timeout);
      pendingMusic = null;
      connectMusic();
    };
    script.onerror = failed;
    pendingMusic = script;
    document.head.append(script);
  };
  control?.addEventListener('click', () => {
    if (window.MoriiMusic) window.MoriiMusic.toggle();
    else loadMusic();
  });
  window.addEventListener('pagehide', () => { releaseMusic?.(); releaseMusic = null; });
  window.addEventListener('pageshow', connectMusic);
  connectMusic(); syncControls();
  document.addEventListener('DOMContentLoaded', syncControls, { once: true });
  let opener;
  const open = () => {
    if (document.documentElement.dataset.printPreview === 'true') return;
    if (dialog.open) return;
    if (document.querySelector('dialog[open]')) return;
    syncControls();
    loadMusic();
    opener = document.activeElement;
    document.getElementById('menu-toggle')?.setAttribute('aria-expanded', 'false');
    document.getElementById('menu-toggle')?.setAttribute('aria-label', t("打开菜单"));
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

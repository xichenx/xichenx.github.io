(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  const dialog = document.getElementById('article-share-dialog');
  if (!dialog || typeof dialog.showModal !== 'function') return;
  const title = document.querySelector('.article-header h1')?.textContent.trim() || document.title;
  const url = document.querySelector('link[rel="canonical"]')?.href || location.href.split('#')[0];
  const markdownTitle = title.replace(/\s+/g, ' ').replace(/[\\[\]]/g, '\\$&');
  const markdown = `[${markdownTitle}](<${url.replace(/</g, '%3C').replace(/>/g, '%3E')}>)`;
  const content = document.getElementById('article-share-content');
  const status = document.getElementById('article-share-status');
  const nativeButton = document.getElementById('article-share-native');
  let opener;
  let session = 0;
  document.getElementById('article-share-title').textContent = title;
  const hint = typeof navigator.share === 'function'
    ? t("可复制链接，或通过系统分享选择应用。")
    : t("当前浏览器不支持系统分享，可复制后粘贴到其他应用。");
  document.querySelectorAll('[data-share-article]').forEach(button => {
    button.hidden = false;
    button.addEventListener('click', () => {
      if (document.documentElement.dataset.printPreview === 'true' || document.querySelector('dialog[open]')) return;
      opener = button;
      content.value = url;
      status.textContent = hint;
      session++;
      dialog.showModal();
    });
  });
  const copy = async (text, label) => {
    const currentSession = session;
    content.value = text;
    try {
      await navigator.clipboard.writeText(text);
      if (dialog.open && currentSession === session) status.textContent = t("已复制{0}，可粘贴到其他应用。", label);
    } catch {
      if (!dialog.open || currentSession !== session) return;
      content.focus();
      content.select();
      status.textContent = t("自动复制不可用，已选中内容，请长按或按 Ctrl/Cmd + C 复制。");
    }
  };
  document.getElementById('article-share-copy').addEventListener('click', () => copy(url, t("文章链接")));
  document.getElementById('article-share-markdown').addEventListener('click', () => copy(markdown, t(" Markdown 链接")));
  nativeButton.hidden = typeof navigator.share !== 'function';
  nativeButton.addEventListener('click', async () => {
    const currentSession = session;
    nativeButton.disabled = true;
    try {
      await navigator.share({ title, url });
      if (dialog.open && currentSession === session) status.textContent = t("系统分享已完成。");
    } catch (error) {
      if (dialog.open && currentSession === session) status.textContent = error?.name === 'AbortError'
        ? t("已取消分享，仍可复制链接。") : t("系统分享暂不可用，请使用复制链接。");
    } finally {
      nativeButton.disabled = false;
    }
  });
  document.getElementById('article-share-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { session++; opener?.focus(); });
})();

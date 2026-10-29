(() => {
  const dialog = document.getElementById('social-dialog');
  const image = document.getElementById('social-qr-image');
  if (!dialog || !image) return;
  const status = document.getElementById('social-qr-status');
  let opener;
  document.querySelectorAll('[data-social-qr]').forEach(button => button.addEventListener('click', () => {
    if (document.documentElement.dataset.printPreview === 'true' || document.querySelector('dialog[open]')) return;
    opener = button;
    document.getElementById('social-dialog-heading').textContent = `扫码关注${button.dataset.socialName}`;
    document.getElementById('social-dialog-description').textContent = button.dataset.socialDescription || '使用对应应用扫一扫关注';
    document.getElementById('social-qr-account').textContent = button.dataset.socialAccount ? `账号：${button.dataset.socialAccount}` : '';
    status.textContent = '正在加载二维码…';
    image.hidden = false;
    image.alt = `${button.dataset.socialName}关注二维码`;
    image.src = button.dataset.socialQr;
    document.getElementById('social-qr-original').href = button.dataset.socialQr;
    dialog.showModal();
  }));
  image.addEventListener('load', () => { status.textContent = '使用对应应用扫一扫关注'; });
  image.addEventListener('error', () => {
    if (!dialog.open) return;
    image.hidden = true;
    status.textContent = '二维码暂时无法加载，可以打开原图查看。';
  });
  document.getElementById('social-dialog-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog.addEventListener('close', () => { image.removeAttribute('src'); opener?.focus(); });
})();

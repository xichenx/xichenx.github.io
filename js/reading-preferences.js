(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  const article = document.querySelector('.article-body');
  const settings = document.querySelector('.reading-settings');
  if (!article || !settings) return;
  const smaller = document.getElementById('reading-font-smaller');
  const larger = document.getElementById('reading-font-larger');
  const focus = document.getElementById('reading-focus-toggle');
  const output = document.getElementById('reading-font-value');
  const status = document.getElementById('reading-settings-status');
  const key = 'morii-reading-preferences';
  let saved;
  try { saved = JSON.parse(localStorage.getItem(key) || '{}'); } catch { saved = {}; }
  const normalizeFont = value => typeof value === 'number' && Number.isFinite(value) ? Math.max(15, Math.min(21, 15 + Math.round((value - 15) / 2) * 2)) : 17;
  const state = { font: normalizeFont(saved?.font), focus: saved?.focus === true };
  const render = () => {
    article.style.setProperty('--reading-font-size', `${state.font}px`);
    document.documentElement.classList.toggle('reading-focus', state.focus);
    output.textContent = `${state.font} px`;
    smaller.disabled = state.font === 15;
    larger.disabled = state.font === 21;
    focus.setAttribute('aria-pressed', String(state.focus));
    // The reading progress and active heading depend on the new layout.
    window.dispatchEvent(new Event('resize'));
  };
  const persist = message => {
    render();
    try {
      localStorage.setItem(key, JSON.stringify(state));
      status.textContent = message;
    } catch { status.textContent = t("{0} 当前浏览器无法保存，下次进入将恢复默认。", message); }
  };
  smaller.addEventListener('click', () => { state.font = Math.max(15, state.font - 2); persist(t("字号已调整为 {0} px。", state.font)); });
  larger.addEventListener('click', () => { state.font = Math.min(21, state.font + 2); persist(t("字号已调整为 {0} px。", state.font)); });
  focus.addEventListener('click', () => { state.focus = !state.focus; persist(state.focus ? t("已开启专注阅读，目录仍可展开查看。") : t("已退出专注阅读。")); });
  document.getElementById('reading-settings-reset').addEventListener('click', () => {
    state.font = 17;
    state.focus = false;
    render();
    try { localStorage.removeItem(key); } catch { /* Preferences still reset for this page. */ }
    status.textContent = t("已恢复默认字号与阅读布局。");
  });
  document.addEventListener('click', event => {
    if (settings.open && !settings.contains(event.target)) settings.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !settings.open || document.querySelector('dialog[open]')) return;
    event.preventDefault();
    settings.open = false;
    settings.querySelector('summary')?.focus();
  });
  settings.hidden = false;
  render();
})();

(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  const counters = [...document.querySelectorAll('[data-site-start]')];
  if (!counters.length) return;
  const update = () => counters.forEach(counter => {
    const output = counter.querySelector('[data-runtime-value]');
    const start = Date.parse(counter.dataset.siteStart);
    if (!output || !Number.isFinite(start)) return;
    const seconds = Math.floor((Date.now() - start) / 1000);
    output.textContent = seconds < 0 ? t("尚未开始") : t("{0} 天 {1} 小时 {2} 分 {3} 秒", Math.floor(seconds / 86400), Math.floor(seconds % 86400 / 3600), Math.floor(seconds % 3600 / 60), seconds % 60);
  });
  let timer;
  const resume = () => {
    clearInterval(timer);
    update();
    if (!document.hidden) timer = setInterval(update, 1000);
  };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pagehide', () => clearInterval(timer));
  window.addEventListener('pageshow', resume);
  resume();
})();

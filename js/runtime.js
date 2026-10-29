(() => {
  const counters = [...document.querySelectorAll('[data-site-start]')];
  if (!counters.length) return;
  const update = () => counters.forEach(counter => {
    const output = counter.querySelector('[data-runtime-value]');
    const start = Date.parse(counter.dataset.siteStart);
    if (!output || !Number.isFinite(start)) return;
    const seconds = Math.floor((Date.now() - start) / 1000);
    output.textContent = seconds < 0 ? '尚未开始' : `${Math.floor(seconds / 86400)} 天 ${Math.floor(seconds % 86400 / 3600)} 小时 ${Math.floor(seconds % 3600 / 60)} 分 ${seconds % 60} 秒`;
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

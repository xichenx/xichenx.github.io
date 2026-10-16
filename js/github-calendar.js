(() => {
  const card = document.querySelector('[data-github-calendar]');
  if (!card) return;
  const grid = card.querySelector('.github-calendar-days');
  const months = card.querySelector('.github-calendar-months');
  const status = card.querySelector('.github-calendar-status');
  const detail = card.querySelector('.github-calendar-detail');
  const retry = card.querySelector('.github-calendar-retry');
  const scroller = card.querySelector('.github-calendar-scroll');
  const key = `morii-github-calendar:${card.dataset.user}:${card.dataset.api}`;
  let pending = false;
  const normalize = data => {
    if (!Array.isArray(data?.contributions)) throw new Error('Invalid contribution data');
    const unique = new Map();
    for (const day of data.contributions) {
      if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day.date) || !Number.isSafeInteger(day.count) || day.count < 0 || !Number.isInteger(day.level) || day.level < 0 || day.level > 4) continue;
      const date = new Date(`${day.date}T00:00:00Z`);
      if (Number.isFinite(+date) && date.toISOString().slice(0, 10) === day.date) unique.set(day.date, { date: day.date, count: day.count, level: day.level });
    }
    const days = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-371);
    if (!days.length) throw new Error('No contributions');
    return days;
  };
  const render = (days, cached = false) => {
    const start = new Date(`${days[0].date}T00:00:00Z`).getUTCDay();
    const first = Date.parse(`${days[0].date}T00:00:00Z`);
    const last = Date.parse(`${days.at(-1).date}T00:00:00Z`);
    const count = Math.min(371, Math.round((last - first) / 86400000) + 1);
    const data = new Map(days.map(day => [day.date, day]));
    const firstDate = last - (count - 1) * 86400000;
    const offset = count === Math.round((last - first) / 86400000) + 1 ? start : new Date(firstDate).getUTCDay();
    grid.replaceChildren(); months.replaceChildren();
    card.style.setProperty('--weeks', String(Math.ceil((offset + count) / 7)));
    for (let i = 0; i < offset; i++) { const blank = document.createElement('span'); blank.setAttribute('aria-hidden', 'true'); grid.append(blank); }
    let month = '';
    let total = 0;
    for (let i = 0; i < count; i++) {
      const date = new Date(firstDate + i * 86400000).toISOString().slice(0, 10);
      const day = data.get(date) || { date, count: 0, level: 0 };
      total += day.count;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'github-calendar-day'; button.dataset.level = String(day.level);
      button.title = `${day.date} · ${day.count} 次贡献`;
      button.setAttribute('aria-label', button.title);
      button.tabIndex = i === count - 1 ? 0 : -1;
      grid.append(button);
      if (date.slice(0, 7) !== month) {
        month = date.slice(0, 7);
        const label = document.createElement('span'); label.textContent = `${Number(date.slice(5, 7))}月`;
        label.style.gridColumn = String(Math.floor((offset + i) / 7) + 1);
        if (months.lastElementChild?.style.gridColumn === label.style.gridColumn) months.lastElementChild.remove();
        months.append(label);
      }
    }
    status.textContent = `${total.toLocaleString()} 次贡献 · 数据截至 ${days.at(-1).date}${cached ? ' · 缓存' : ''}`;
    detail.textContent = '悬停或点选日期查看详情；可用方向键切换。';
    scroller.scrollLeft = scroller.scrollWidth;
  };
  const load = async () => {
    if (pending) return;
    pending = true; retry.hidden = true; card.setAttribute('aria-busy', 'true');
    status.textContent = '正在加载 GitHub 贡献记录…';
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(card.dataset.api, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error('Contribution service unavailable');
      const days = normalize(await response.json());
      render(days);
      try { sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), contributions: days })); } catch { /* Cache is optional. */ }
    } catch {
      status.textContent = '贡献数据暂时无法加载，可重试或点击账号前往 GitHub。';
      retry.hidden = false;
    } finally { clearTimeout(timer); pending = false; card.setAttribute('aria-busy', 'false'); }
  };
  const showDetail = event => {
    const button = event.target.closest('.github-calendar-day');
    if (!button) return;
    detail.textContent = button.title;
    grid.querySelector('[tabindex="0"]')?.setAttribute('tabindex', '-1');
    button.tabIndex = 0;
  };
  for (const type of ['pointerover', 'focusin', 'click']) grid.addEventListener(type, showDetail);
  grid.addEventListener('keydown', event => {
    const buttons = [...grid.querySelectorAll('button')];
    const current = buttons.indexOf(event.target);
    const steps = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    if (current < 0 || (!Object.hasOwn(steps, event.key) && event.key !== 'Home' && event.key !== 'End')) return;
    event.preventDefault();
    const index = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, current + steps[event.key]));
    buttons[index].focus({ preventScroll: true }); buttons[index].scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });
  retry.addEventListener('click', load);
  try {
    const cached = JSON.parse(sessionStorage.getItem(key) || 'null');
    if (cached && Number.isFinite(cached.at) && Date.now() - cached.at >= 0 && Date.now() - cached.at < 3600000) { render(normalize(cached), true); return; }
  } catch { /* Fetch when cache is missing or invalid. */ }
  if (typeof IntersectionObserver === 'function') {
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { observer.disconnect(); load(); } }, { rootMargin: '200px' });
    observer.observe(card);
  } else load();
})();

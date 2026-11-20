(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  const cards = [...document.querySelectorAll('[data-weather-clock]')];
  if (!cards.length) return;
  const zone = cards[0].dataset.timezone || 'Asia/Shanghai';
  let formatter;
  try { formatter = new Intl.DateTimeFormat(window.MoriiI18n?.locale || 'zh-CN', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
  catch { formatter = new Intl.DateTimeFormat(window.MoriiI18n?.locale || 'zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }); }
  const set = (selector, text) => cards.forEach(card => { const element = card.querySelector(selector); if (element) element.textContent = text; });
  const tick = () => {
    const now = new Date();
    const parts = Object.fromEntries(formatter.formatToParts(now).map(part => [part.type, part.value]));
    const time = `${parts.hour}:${parts.minute}:${parts.second}`;
    set('[data-clock-date]', `${parts.year}-${parts.month}-${parts.day} ${parts.weekday.toUpperCase()}`);
    set('[data-clock-period]', Number(parts.hour) >= 12 ? 'PM' : 'AM');
    cards.forEach(card => {
      const clock = card.querySelector('[data-clock-time]');
      clock.dateTime = now.toISOString();
      clock.setAttribute('aria-label', `${zone} ${time}`);
      [...card.querySelectorAll('[data-clock-digit]')].forEach((digit, index) => { digit.dataset.clockDigit = time.replaceAll(':', '')[index]; });
    });
  };
  const condition = code => {
    if (code === 0) return [t("晴"), '☀'];
    if (code === 1) return [t("晴间多云"), '☀'];
    if (code === 2) return [t("多云"), '☁'];
    if (code === 3) return [t("阴"), '☁'];
    if ([45, 48].includes(code)) return [t("雾"), '≋'];
    if ([51, 53, 55, 56, 57].includes(code)) return [t("毛毛雨"), '☂'];
    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return [t("雨"), '☂'];
    if ([71, 73, 75, 77, 85, 86].includes(code)) return [t("雪"), '❄'];
    if ([95, 96, 99].includes(code)) return [t("雷雨"), 'ϟ'];
    return [t("天气"), '☁'];
  };
  const valid = current => current && ['temperature_2m', 'relative_humidity_2m', 'weather_code', 'wind_direction_10m', 'time'].every(key => typeof current[key] === 'number' && Number.isFinite(current[key])) && current.temperature_2m >= -100 && current.temperature_2m <= 70 && Number.isFinite(new Date(current.time * 1000).getTime()) && current.relative_humidity_2m >= 0 && current.relative_humidity_2m <= 100 && current.wind_direction_10m >= 0 && current.wind_direction_10m <= 360;
  const show = (current, cached = false) => {
    const [label, icon] = condition(current.weather_code);
    set('[data-weather-condition]', label);
    set('[data-weather-icon]', icon);
    set('[data-weather-temperature]', String(Math.round(current.temperature_2m)));
    set('[data-weather-humidity]', String(Math.round(current.relative_humidity_2m)));
    const winds = [t("北风"), t("东北风"), t("东风"), t("东南风"), t("南风"), t("西南风"), t("西风"), t("西北风")];
    set('[data-weather-wind]', `⚑ ${winds[Math.round(current.wind_direction_10m / 45) % 8]}`);
    const time = new Intl.DateTimeFormat((window.MoriiI18n?.locale || 'zh-CN'), { timeZone: zone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(current.time * 1000));
    set('[data-weather-status]', t("{0}天气 {1} 更新", cached ? t("缓存 · ") : '', time));
  };
  const url = cards[0].dataset.weatherUrl;
  const key = `morii-weather:${url}`;
  let cache;
  try { const saved = JSON.parse(localStorage.getItem(key) || 'null'); if (valid(saved?.current) && saved.savedAt <= Date.now() && Date.now() - saved.savedAt < 3600000) cache = saved; } catch { /* Weather works without browser storage. */ }
  let pending = false;
  const load = async (force = false) => {
    if (pending || !url) return;
    if (!force && cache && Date.now() - cache.savedAt < 600000) { show(cache.current); return; }
    pending = true;
    cards.forEach(card => { card.querySelector('[data-weather-refresh]').disabled = true; });
    if (cache) show(cache.current, true);
    else set('[data-weather-status]', t("正在获取天气…"));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Weather unavailable');
      const data = await response.json();
      if (!valid(data.current)) throw new Error('Invalid weather');
      cache = { current: data.current, savedAt: Date.now() };
      show(data.current);
      try { localStorage.setItem(key, JSON.stringify(cache)); } catch { /* Keep this page's data. */ }
    } catch {
      if (cache) { show(cache.current, true); set('[data-weather-status]', t("暂用缓存天气，可点击刷新")); }
      else set('[data-weather-status]', t("天气暂不可用，可点击刷新"));
    } finally {
      clearTimeout(timeout);
      pending = false;
      cards.forEach(card => { card.querySelector('[data-weather-refresh]').disabled = false; });
    }
  };
  cards.forEach(card => card.querySelector('[data-weather-refresh]')?.addEventListener('click', () => load(true)));
  let timer;
  let refreshTimer;
  const start = () => {
    clearInterval(timer);
    clearInterval(refreshTimer);
    tick();
    timer = setInterval(() => { if (!document.hidden) tick(); }, 1000);
    if (url) refreshTimer = setInterval(() => { if (!document.hidden) load(); }, 600000);
  };
  window.addEventListener('pagehide', () => { clearInterval(timer); clearInterval(refreshTimer); });
  window.addEventListener('pageshow', start);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { tick(); load(); } });
  start();
  load();
})();

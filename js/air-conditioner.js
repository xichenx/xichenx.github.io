(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  const appliance = document.querySelector('.ac-page');
  if (!appliance) return;
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem('morii-air-conditioner') || localStorage.getItem('mingzhi-air-conditioner') || '{}') || {}; } catch { /* Use defaults if storage is unavailable or invalid. */ }
  const temperature = typeof saved.temperature === 'number' && Number.isFinite(saved.temperature) ? saved.temperature : 26;
  const state = { powered: false, temperature: Math.max(16, Math.min(30, Math.round(temperature))), mode: saved.mode === 'heat' ? 'heat' : 'cool', swing: saved.swing === true };
  const power = document.getElementById('ac-power');
  const decrease = document.getElementById('ac-decrease');
  const increase = document.getElementById('ac-increase');
  const swing = document.getElementById('ac-swing');
  const modeButtons = [...appliance.querySelectorAll('[data-ac-mode]')];
  const render = () => {
    appliance.dataset.powered = state.powered ? 'on' : 'off';
    appliance.dataset.mode = state.mode;
    appliance.dataset.swing = state.swing ? 'on' : 'off';
    power.textContent = state.powered ? t("关闭空调") : t("开启空调");
    power.setAttribute('aria-pressed', String(state.powered));
    document.getElementById('ac-temperature').textContent = state.temperature;
    document.getElementById('ac-device-temperature').textContent = state.powered ? state.temperature : '—';
    document.getElementById('ac-device-mode').textContent = state.mode === 'heat' ? '☀' : '❄';
    document.getElementById('ac-status').textContent = state.powered ? t("空调已开启 · {0} · {1}°C{2}", state.mode === 'heat' ? t("制热") : t("制冷"), state.temperature, state.swing ? t(" · 摆风") : '') : t("空调已关闭");
    decrease.disabled = !state.powered || state.temperature <= 16;
    increase.disabled = !state.powered || state.temperature >= 30;
    swing.disabled = !state.powered;
    swing.textContent = state.swing ? t("关闭摆风") : t("开启摆风");
    swing.setAttribute('aria-pressed', String(state.swing));
    modeButtons.forEach(button => {
      button.disabled = !state.powered;
      button.setAttribute('aria-pressed', String(button.dataset.acMode === state.mode));
    });
    try {
      localStorage.setItem('morii-air-conditioner', JSON.stringify({ temperature: state.temperature, mode: state.mode, swing: state.swing }));
    } catch { /* Controls remain usable without persistence. */ }
  };
  power.addEventListener('click', () => { state.powered = !state.powered; render(); });
  decrease.addEventListener('click', () => { if (state.powered) state.temperature = Math.max(16, state.temperature - 1); render(); });
  increase.addEventListener('click', () => { if (state.powered) state.temperature = Math.min(30, state.temperature + 1); render(); });
  swing.addEventListener('click', () => { if (state.powered) state.swing = !state.swing; render(); });
  modeButtons.forEach(button => button.addEventListener('click', () => { if (state.powered) state.mode = button.dataset.acMode; render(); }));
  render();
})();

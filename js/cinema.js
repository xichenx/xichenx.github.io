(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  'use strict';
  const root = document.querySelector('[data-cinema]');
  if (!root) return;
  const cards = [...root.querySelectorAll('[data-cinema-card]')];
  const video = root.querySelector('[data-cinema-video]');
  const embed = root.querySelector('[data-cinema-embed]');
  const placeholder = root.querySelector('[data-cinema-placeholder]');
  const title = root.querySelector('[data-cinema-title]');
  const description = root.querySelector('[data-cinema-description]');
  const type = root.querySelector('[data-cinema-type]');
  const noResults = root.querySelector('[data-cinema-no-results]');
  const search = root.querySelector('[data-cinema-search]');
  const filters = [...root.querySelectorAll('[data-cinema-filter]')];
  const watchFilter = root.querySelector('[data-cinema-filter="watchlist"]');
  const watchCount = root.querySelector('[data-cinema-watch-count]');
  const watchButtons = new Map(cards.map(card => [card, card.querySelector('[data-cinema-watch]')]));
  const stage = root.querySelector('[data-cinema-stage]');
  const close = root.querySelector('[data-cinema-close]');
  const episodeAnchor = root.querySelector('[data-cinema-episodes-anchor]');
  if (!video || !embed) return;
  let activeFilter = 'all';
  let episodeList;
  let selectedButton;
  const watchStorageKey = `morii-cinema-watchlist:${root.dataset.cinema}`;
  const watchlist = new Set();
  try {
    const saved = JSON.parse(localStorage.getItem(watchStorageKey));
    if (Array.isArray(saved)) saved.filter(id => typeof id === 'string').forEach(id => watchlist.add(id));
  } catch { /* The watchlist can still be used while the page is open. */ }

  function updateWatchlist() {
    let count = 0;
    for (const button of watchButtons.values()) {
      const saved = watchlist.has(button.dataset.cinemaWatch);
      button.setAttribute('aria-pressed', String(saved));
      if (saved) count++;
    }
    watchCount.textContent = count;
  }

  function stop() {
    video.pause();
    video.removeAttribute('src');
    video.load();
    embed.removeAttribute('src');
    video.hidden = true;
    embed.hidden = true;
    placeholder.hidden = false;
  }

  function play(episode, button) {
    stop();
    episodeList?.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    placeholder.hidden = true;
    if (episode.dataset.kind === 'embed') {
      embed.src = episode.dataset.url;
      embed.title = episode.dataset.title;
      embed.hidden = false;
    } else {
      video.src = episode.dataset.url;
      video.hidden = false;
      video.play().catch(() => {});
    }
    document.getElementById('music-player')?.pause();
    stage?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function select(card) {
    stop();
    selectedButton = card.querySelector('[data-cinema-select]');
    cards.forEach(item => {
      const selected = item === card;
      item.classList.toggle('is-selected', selected);
      item.querySelector('[data-cinema-select]').setAttribute('aria-pressed', String(selected));
    });
    title.textContent = card.dataset.title;
    description.textContent = card.dataset.description || t("选一集，开始播放。");
    type.textContent = { movie: t("电影"), series: t("电视剧"), anime: t("动漫") }[card.dataset.type] || t("电影");
    episodeList?.remove();
    episodeList = document.createElement('div');
    episodeList.className = 'cinema-episodes';
    episodeList.setAttribute('role', 'group');
    episodeList.setAttribute('aria-label', t("{0} 选集", card.dataset.title));
    const episodes = [...card.querySelectorAll('[data-cinema-episode]')];
    const label = document.createElement('span');
    label.className = 'cinema-episodes-title';
    label.textContent = episodes.length ? t("选择片源 / 选集") : t("片源状态");
    episodeList.append(label);
    if (!episodes.length) {
      const note = document.createElement('p');
      note.textContent = t("这部作品暂时没有可用片源。");
      episodeList.append(note);
    }
    episodes.forEach(episode => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = episode.dataset.title;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => play(episode, button));
      episodeList.append(button);
    });
    episodeAnchor.append(episodeList);
    stage.hidden = false;
    stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function filter() {
    const query = search.value.trim().toLocaleLowerCase();
    let visible = 0;
    cards.forEach(card => {
      const matchesFilter = activeFilter === 'watchlist'
        ? watchlist.has(watchButtons.get(card).dataset.cinemaWatch)
        : activeFilter === 'all' || card.dataset.type === activeFilter;
      const show = matchesFilter && card.dataset.title.toLocaleLowerCase().includes(query);
      card.hidden = !show;
      if (show) visible++;
    });
    if (noResults) {
      noResults.hidden = visible !== 0;
      if (!visible) noResults.textContent = activeFilter === 'watchlist' && watchCount.textContent === '0'
        ? t("想看片单还是空的。返回全部作品，点星标添加。")
        : t("没有找到符合条件的作品，试试别的关键词。");
    }
  }

  for (const [card, button] of watchButtons) {
    button.addEventListener('click', () => {
      const key = button.dataset.cinemaWatch;
      if (!watchlist.delete(key)) watchlist.add(key);
      try { localStorage.setItem(watchStorageKey, JSON.stringify([...watchlist])); } catch { /* Keep the current list in memory. */ }
      updateWatchlist();
      filter();
      if (card.hidden) watchFilter.focus();
    });
    button.hidden = false;
  }
  updateWatchlist();
  watchFilter.hidden = false;
  cards.forEach(card => card.querySelector('[data-cinema-select]').addEventListener('click', () => select(card)));
  close?.addEventListener('click', () => {
    stop();
    stage.hidden = true;
    cards.forEach(card => {
      card.classList.remove('is-selected');
      card.querySelector('[data-cinema-select]').setAttribute('aria-pressed', 'false');
    });
    if (selectedButton?.closest('[data-cinema-card]').hidden) filters.find(button => button.dataset.cinemaFilter === activeFilter)?.focus();
    else selectedButton?.focus();
  });
  filters.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.cinemaFilter;
    filters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    filter();
  }));
  search?.addEventListener('input', filter);
  window.addEventListener('pagehide', stop);
})();

(() => {
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
  const stage = root.querySelector('[data-cinema-stage]');
  const close = root.querySelector('[data-cinema-close]');
  const episodeAnchor = root.querySelector('[data-cinema-episodes-anchor]');
  if (!video || !embed) return;
  let activeFilter = 'all';
  let episodeList;
  let selectedButton;

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
    description.textContent = card.dataset.description || '选一集，开始播放。';
    type.textContent = { movie: '电影', series: '电视剧', anime: '动漫' }[card.dataset.type] || '电影';
    episodeList?.remove();
    episodeList = document.createElement('div');
    episodeList.className = 'cinema-episodes';
    episodeList.setAttribute('role', 'group');
    episodeList.setAttribute('aria-label', `${card.dataset.title} 选集`);
    const episodes = [...card.querySelectorAll('[data-cinema-episode]')];
    const label = document.createElement('span');
    label.className = 'cinema-episodes-title';
    label.textContent = episodes.length ? '选择片源 / 选集' : '片源状态';
    episodeList.append(label);
    if (!episodes.length) {
      const note = document.createElement('p');
      note.textContent = '这部作品暂时没有可用片源。';
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
      const show = (activeFilter === 'all' || card.dataset.type === activeFilter) && card.dataset.title.toLocaleLowerCase().includes(query);
      card.hidden = !show;
      if (show) visible++;
    });
    if (noResults) noResults.hidden = visible !== 0;
  }

  cards.forEach(card => card.querySelector('[data-cinema-select]').addEventListener('click', () => select(card)));
  close?.addEventListener('click', () => {
    stop();
    stage.hidden = true;
    cards.forEach(card => {
      card.classList.remove('is-selected');
      card.querySelector('[data-cinema-select]').setAttribute('aria-pressed', 'false');
    });
    selectedButton?.focus();
  });
  filters.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.cinemaFilter;
    filters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    filter();
  }));
  search?.addEventListener('input', filter);
  window.addEventListener('pagehide', stop);
})();

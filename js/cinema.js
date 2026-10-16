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
  let activeFilter = 'all';
  let episodeList;

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
    root.querySelector('.cinema-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function select(card) {
    stop();
    cards.forEach(item => item.classList.toggle('is-selected', item === card));
    title.textContent = card.dataset.title;
    description.textContent = card.dataset.description || '选一集，开始播放。';
    type.textContent = { movie: '电影', series: '电视剧', anime: '动漫' }[card.dataset.type] || '电影';
    episodeList?.remove();
    episodeList = document.createElement('div');
    episodeList.className = 'cinema-episodes';
    episodeList.setAttribute('role', 'group');
    episodeList.setAttribute('aria-label', `${card.dataset.title} 选集`);
    const episodes = [...card.querySelectorAll('[data-cinema-episode]')];
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
    root.querySelector('.cinema-now').append(episodeList);
    root.querySelector('.cinema-stage')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  filters.forEach(button => button.addEventListener('click', () => {
    activeFilter = button.dataset.cinemaFilter;
    filters.forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    filter();
  }));
  search?.addEventListener('input', filter);
  window.addEventListener('pagehide', stop);
})();

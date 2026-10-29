(() => {
  const hub = document.getElementById('morii-audio-hub');
  if (!hub) return;
  let inherited;
  try { if (parent !== window && parent.location.origin === location.origin) inherited = parent.MoriiMusic; } catch { /* Standalone page. */ }
  const safeURL = value => {
    if (typeof value !== 'string' || !value.trim() || /[\\\u0000-\u001f]/.test(value)) return '';
    try { const url = new URL(value, location.href); return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.href : ''; } catch { return ''; }
  };
  const parseLyrics = text => {
    const offset = Number(text.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0) / 1000;
    const lines = [];
    for (const raw of text.split(/\r?\n/)) {
      const stamps = [...raw.matchAll(/\[(\d{1,3}):(\d{2}(?:\.\d{1,3})?)\]/g)];
      const words = raw.replace(/\[[^\]]*\]/g, '').trim();
      if (!words) continue;
      for (const stamp of stamps) lines.push({ time: Math.max(0, Number(stamp[1]) * 60 + Number(stamp[2]) + offset), text: words });
    }
    return lines.sort((a, b) => a.time - b.time);
  };
  const formatTime = seconds => Number.isFinite(seconds) && seconds >= 0 ? `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}` : '0:00';
  let api = inherited;
  if (!api) {
    let config;
    try { config = JSON.parse(hub.dataset.musicConfig); } catch { return; }
    const player = document.getElementById('music-player');
    const listeners = new Set();
    const normalize = data => (Array.isArray(data) ? data : []).filter(item => item && typeof item === 'object').flatMap(item => {
      const url = safeURL(item.url);
      const text = value => typeof value === 'string' ? value.trim() : '';
      return url ? [{ url, title: text(item.title) || text(item.name) || '未命名曲目', artist: text(item.artist) || text(item.author) || '未知音乐人', cover: safeURL(item.cover || item.pic), lrc: safeURL(item.lrc), lyrics: text(item.lyrics) || (typeof item.lrc === 'string' && item.lrc.includes('[0') ? item.lrc : '') }] : [];
    });
    const state = { tracks: normalize(config.tracks), current: 0, playing: false, time: 0, duration: 0, volume: config.volume ?? .7, mode: 0, status: '选择一首音乐，开始聆听。', fetchStatus: '', loading: false, failed: false, lyrics: [], lyricIndex: -1, lyricStatus: '播放一首歌，让旋律和文字相遇。', activated: false };
    const emit = () => listeners.forEach(listener => listener(state));
    let playRequest = 0;
    let lyricRequest = 0;
    let lyricController;
    let loaded = false;
    let loadingPromise;
    const timedFetch = async (url, kind, controller = new AbortController(), timeoutMs = 15000) => {
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error('request failed');
        return await response[kind]();
      } finally { clearTimeout(timeout); }
    };
    const lyricCache = new Map();
    const loadLyrics = async track => {
      const token = ++lyricRequest;
      lyricController?.abort(); lyricController = new AbortController();
      state.lyrics = []; state.lyricIndex = -1; state.lyricStatus = '正在加载歌词…'; emit();
      try {
        let text = track.lyrics;
        if (!text && track.lrc) {
          if (lyricCache.has(track.lrc)) text = lyricCache.get(track.lrc);
          else { text = await timedFetch(track.lrc, 'text', lyricController); lyricCache.set(track.lrc, text); }
        }
        if (token !== lyricRequest) return;
        state.lyrics = parseLyrics(text || '');
        state.lyricStatus = state.lyrics.length ? '' : '暂无同步歌词，静静听一会儿。';
      } catch {
        if (token !== lyricRequest) return;
        state.lyricStatus = '歌词暂时无法加载，音乐仍可继续播放。';
      }
      emit();
    };
    const prepare = index => {
      if (!state.tracks[index]) return;
      state.current = index; state.time = 0; state.duration = 0;
      player.src = state.tracks[index].url;
      loadLyrics(state.tracks[index]);
    };
    const play = async index => {
      if (!state.tracks[index]) return;
      const token = ++playRequest;
      if (index !== state.current || !player.getAttribute('src')) prepare(index);
      state.activated = true; state.status = '正在加载音频…'; emit();
      try { await player.play(); }
      catch (error) {
        if (token !== playRequest || error?.name === 'AbortError') return;
        state.playing = false; state.status = '这首歌曲暂时无法播放，可以切换下一首或打开原平台歌单。'; emit();
      }
    };
    const nextIndex = direction => {
      if (state.mode === 3 && state.tracks.length > 1) return (state.current + 1 + Math.floor(Math.random() * (state.tracks.length - 1))) % state.tracks.length;
      const index = state.current + direction;
      return state.mode === 1 ? (index + state.tracks.length) % state.tracks.length : Math.max(0, Math.min(state.tracks.length - 1, index));
    };
    const load = () => {
      if (loadingPromise) return loadingPromise;
      if (!config.remote) {
        loaded = true; state.fetchStatus = state.tracks.length ? `${state.tracks.length} 首本地曲目` : '暂未配置歌单。';
        if (state.tracks.length && !player.getAttribute('src')) prepare(0);
        emit(); return Promise.resolve();
      }
      const cacheKey = `morii-music:${config.remote.server}:${config.remote.type}:${config.remote.id}`;
      if (!loaded) {
        try {
          const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
          const tracks = cached && Date.now() - cached.at < 1800000 ? normalize(cached.tracks) : [];
          if (tracks.length) {
            state.tracks = tracks; prepare(0); loaded = true;
            state.fetchStatus = `已获取 ${tracks.length} 首歌曲`;
            emit(); return Promise.resolve();
          }
        } catch { /* Continue with the network when storage is unavailable. */ }
      }
      state.loading = true; state.failed = false; state.fetchStatus = '正在获取歌单…'; emit();
      loadingPromise = (async () => {
        try {
          const values = { ...config.remote, r: String(Math.random()) };
          const endpoint = safeURL(config.remote.api.replace(/:(server|type|id|r)\b/g, (_, key) => encodeURIComponent(values[key])));
          if (!endpoint) throw new Error('invalid endpoint');
          const tracks = normalize(await timedFetch(endpoint, 'json', new AbortController(), 8000));
          if (!tracks.length) throw new Error('empty playlist');
          if (state.activated) { state.fetchStatus = '当前播放队列已保留。'; return; }
          state.tracks = tracks; prepare(0); loaded = true;
          state.fetchStatus = `已获取 ${tracks.length} 首歌曲`;
          try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), tracks })); } catch { /* Playback does not depend on storage. */ }
        } catch {
          state.failed = true;
          state.fetchStatus = state.tracks.length ? '在线歌单获取失败，可播放本地曲目。' : '歌单获取失败，请重试或打开原平台歌单。';
          if (state.tracks.length && !player.getAttribute('src')) prepare(0);
        } finally { state.loading = false; loadingPromise = null; emit(); }
      })();
      return loadingPromise;
    };
    player.volume = state.volume;
    player.addEventListener('play', () => { state.playing = true; emit(); });
    player.addEventListener('playing', () => { state.playing = true; state.status = `正在播放：${state.tracks[state.current]?.title || ''}`; emit(); });
    player.addEventListener('pause', () => { state.playing = false; if (!player.error) state.status = '已暂停，可以随时继续。'; emit(); });
    player.addEventListener('error', () => { state.playing = false; state.status = '音频暂不可用，请切换歌曲或打开原平台歌单。'; emit(); });
    player.addEventListener('loadedmetadata', () => { state.duration = Number.isFinite(player.duration) ? player.duration : 0; emit(); });
    player.addEventListener('timeupdate', () => {
      state.time = player.currentTime; state.duration = Number.isFinite(player.duration) ? player.duration : 0;
      let low = 0; let high = state.lyrics.length - 1; let active = -1;
      while (low <= high) { const middle = Math.floor((low + high) / 2); if (state.lyrics[middle].time <= state.time) { active = middle; low = middle + 1; } else high = middle - 1; }
      state.lyricIndex = active; emit();
    });
    player.addEventListener('ended', () => {
      if (state.mode === 2) { player.currentTime = 0; play(state.current); }
      else if (state.current < state.tracks.length - 1 || state.mode === 1 || state.mode === 3) play(nextIndex(1));
      else { state.playing = false; state.status = '已听完全部曲目。'; emit(); }
    });
    api = {
      state, player, parseLyrics,
      subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
      load, ensure() { return loaded ? Promise.resolve() : load(); }, play,
      toggle() { if (!state.tracks.length) return load(); if (!player.paused) player.pause(); else return play(state.current); },
      step(direction) { if (state.tracks.length) return play(nextIndex(direction)); },
      seek(time) { if (Number.isFinite(time) && Number.isFinite(player.duration) && player.duration > 0) { player.currentTime = Math.max(0, Math.min(player.duration, time)); player.dispatchEvent(new Event('timeupdate')); } },
      volume(value) { state.volume = Math.max(0, Math.min(1, Number(value) || 0)); player.volume = state.volume; emit(); },
      mode() { state.mode = (state.mode + 1) % 4; emit(); }
    };
    window.MoriiMusic = api;
    // The audio stays in this document; site pages navigate in a single same-origin frame.
    // Each destination gets its own normal page lifecycle without replacing the audio element.
    const originURL = new URL(location.href);
    const originTitle = document.title;
    let frame;
    let shellActive = false;
    let currentURL = location.href;
    let pendingDocument;
    let readyTimer;
    let fallbackTimer;
    const musicPath = new URL(hub.dataset.musicPage, location.href).pathname;
    const updateFloating = () => {
      const inRoom = new URL(currentURL).pathname === musicPath;
      hub.querySelector('.music-float').hidden = !state.tracks.length || inRoom;
    };
    const visit = (url, push = true) => {
      if (push) history.pushState({ moriiMusic: true }, '', url);
      currentURL = url; updateFloating();
      clearInterval(readyTimer); clearTimeout(fallbackTimer);
      if (new URL(url).pathname === originURL.pathname && new URL(url).search === originURL.search) {
        shellActive = false; document.body.classList.remove('music-shell-active', 'music-shell-loading');
        if (frame) frame.hidden = true;
        document.title = originTitle;
        document.getElementById('main')?.setAttribute('tabindex', '-1');
        document.getElementById('main')?.focus({ preventScroll: true });
        window.dispatchEvent(new Event('morii:music-view')); return;
      }
      shellActive = true; document.body.classList.add('music-shell-loading');
      if (!frame) {
        frame = document.createElement('iframe'); frame.id = 'morii-site-frame'; frame.title = '网站内容';
        frame.addEventListener('load', showFrame);
        document.body.append(frame);
      }
      const oldDocument = frame.contentDocument;
      pendingDocument = oldDocument;
      if (!document.body.classList.contains('music-shell-active')) frame.hidden = true;
      frame.contentWindow.location.replace(url);
      readyTimer = setInterval(showFrame, 80);
      fallbackTimer = setTimeout(() => {
        if (shellActive && document.body.classList.contains('music-shell-loading')) location.assign(currentURL);
      }, 12000);
    };
    const showFrame = () => {
      if (!document.body.classList.contains('music-shell-loading')) return;
      try {
        const content = frame?.contentDocument;
        if (!shellActive || !content || content === pendingDocument || content.readyState === 'loading' || !content.getElementById('main')) return;
        const frameURL = frame.contentWindow.location.href;
        if (frameURL === 'about:blank') return;
        clearInterval(readyTimer); clearTimeout(fallbackTimer);
        document.body.classList.remove('music-shell-loading');
        document.body.classList.add('music-shell-active');
        frame.hidden = false;
        currentURL = frameURL;
        if (location.href !== frameURL) history.replaceState({ moriiMusic: true }, '', frameURL);
        const frameTheme = content.documentElement.dataset.theme;
        if (frameTheme) document.documentElement.dataset.theme = frameTheme;
        document.title = content.title;
        frame.title = content.title || '网站内容';
        bindNavigation(content); updateFloating();
        content.getElementById('main')?.setAttribute('tabindex', '-1');
        content.getElementById('main')?.focus({ preventScroll: true });
      } catch { /* External navigation is left to the browser. */ }
    };
    const boundDocuments = new WeakSet();
    const bindNavigation = doc => {
      if (boundDocuments.has(doc)) return;
      boundDocuments.add(doc);
      doc.addEventListener('click', event => {
        if (!state.activated || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const link = event.target.closest?.('a[href]');
        if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self') || link.closest('[data-music-view] .music-track-list') || link.hasAttribute('data-no-music-nav')) return;
        const url = new URL(link.href, doc.location.href);
        if (!/^https?:$/.test(url.protocol)) return;
        if (url.origin !== location.origin) {
          if (doc !== document) { event.preventDefault(); location.assign(url.href); }
          return;
        }
        if (url.pathname === doc.location.pathname && url.search === doc.location.search && url.hash) return;
        if (/\.[a-z0-9]+$/i.test(url.pathname) && !/\.html?$/i.test(url.pathname)) return;
        event.preventDefault(); visit(url.href);
      });
    };
    window.addEventListener('storage', event => {
      if (event.key === 'morii-theme' && ['dark', 'light'].includes(event.newValue)) document.documentElement.dataset.theme = event.newValue;
    });
    bindNavigation(document);
    window.addEventListener('popstate', () => { if (frame || shellActive) visit(location.href, false); });
    api.subscribe(updateFloating);
    const float = hub.querySelector('.music-float');
    const ball = hub.querySelector('.music-ball');
    const trackButton = hub.querySelector('.music-float-track');
    const lyric = hub.querySelector('#music-capsule-lyrics');
    const expand = value => {
      float.classList.toggle('is-expanded', value);
      trackButton.setAttribute('aria-expanded', String(value));
      lyric.setAttribute('aria-hidden', String(!value));
    };
    trackButton.addEventListener('click', () => expand(!float.classList.contains('is-expanded')));
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && float.contains(document.activeElement)) { expand(false); trackButton.focus(); }
    });
    let wasPlaying = false;
    let floatCover = '';
    api.subscribe(s => {
      const track = s.tracks[s.current];
      float.classList.toggle('is-playing', s.playing);
      if (s.playing !== wasPlaying) { expand(s.playing); wasPlaying = s.playing; }
      ball.setAttribute('aria-label', s.playing ? '暂停音乐' : '播放音乐');
      hub.querySelector('.music-ball-state').textContent = s.playing ? 'Ⅱ' : '▶';
      hub.querySelector('.music-capsule-progress').style.transform = `scaleX(${s.duration ? Math.min(1, s.time / s.duration) : 0})`;
      trackButton.title = `${track?.title || '音乐馆'} · 点击展开或收起歌词`;
      hub.querySelectorAll('[data-music-title]').forEach(node => { node.textContent = track?.title || '未选择音乐'; });
      hub.querySelectorAll('[data-music-artist]').forEach(node => { node.textContent = track?.artist || ''; });
      hub.querySelector('[data-music-mini-lyric]').textContent = s.lyrics[s.lyricIndex]?.text || s.lyricStatus || '让音乐陪你继续探索。';
      hub.querySelector('[data-music-status]').textContent = s.status;
      ball.title = `${track?.title || '音乐馆'} · ${s.playing ? '正在播放' : '已暂停'}`;
      if (track?.cover !== floatCover) {
        floatCover = track?.cover || '';
        const image = hub.querySelector('.music-ball-cover'); image.hidden = !floatCover;
        if (floatCover) image.src = floatCover; else image.removeAttribute('src');
      }
    });
    hub.querySelector('.music-ball-cover').addEventListener('error', event => { event.target.hidden = true; });
  } else {
    hub.hidden = true;
    window.MoriiMusic = api;
  }
  const modes = ['顺序播放', '列表循环', '单曲循环', '随机播放'];
  const bindControls = root => {
    root.querySelectorAll('[data-music-action]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.musicAction;
      if (action === 'toggle') api.toggle();
      else if (action === 'previous' || action === 'next') api.step(action === 'next' ? 1 : -1);
      else if (action === 'mode') api.mode();
    }));
    return api.subscribe(s => {
      root.querySelectorAll('[data-music-toggle]').forEach(button => { button.disabled = !s.tracks.length; button.textContent = s.playing ? 'Ⅱ' : '▶'; button.setAttribute('aria-label', s.playing ? '暂停' : '播放'); });
      root.querySelectorAll('[data-music-action="previous"]').forEach(button => { button.disabled = !s.tracks.length || s.mode === 0 && s.current === 0; });
      root.querySelectorAll('[data-music-action="next"]').forEach(button => { button.disabled = !s.tracks.length || s.mode === 0 && s.current === s.tracks.length - 1; });
    });
  };
  const dispose = [];
  if (!inherited) dispose.push(bindControls(hub));
  const room = document.querySelector('[data-music-view]');
  if (room) {
    dispose.push(bindControls(room));
    const list = room.querySelector('.music-track-list');
    const search = room.querySelector('#music-search');
    const lyrics = room.querySelector('.music-lyrics');
    const follow = room.querySelector('.music-lyrics-follow');
    let renderedTracks; let renderedLyrics; let renderedTrack; let lyricIndex = -2; let following = true;
    const filter = () => {
      const words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
      const rows = [...list.children];
      rows.forEach(row => { row.hidden = !words.every(word => row.dataset.trackSearch.includes(word)); });
      room.querySelector('#music-search-empty').hidden = !rows.length || rows.some(row => !row.hidden);
    };
    const part = (tag, className, text = '') => { const node = document.createElement(tag); node.className = className; node.textContent = text; return node; };
    const scrollLyric = () => {
      const active = lyrics.querySelector('[aria-current]');
      if (!active || !following) return;
      const top = active.offsetTop - lyrics.offsetTop - lyrics.clientHeight / 2 + active.offsetHeight / 2;
      if (typeof lyrics.scrollTo === 'function') lyrics.scrollTo({ top, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
    };
    window.addEventListener('morii:music-view', scrollLyric);
    window.addEventListener('resize', scrollLyric);
    ['wheel', 'touchstart', 'pointerdown'].forEach(type => lyrics.addEventListener(type, () => { following = false; follow.hidden = false; }, { passive: true }));
    follow.addEventListener('click', () => { following = true; follow.hidden = true; scrollLyric(); });
    search.addEventListener('input', filter);
    room.querySelector('#music-retry').addEventListener('click', () => api.load());
    room.querySelector('.music-seek').addEventListener('input', event => api.seek(Number(event.target.value) / 100 * api.state.duration));
    room.querySelector('.music-volume').addEventListener('input', event => api.volume(event.target.value));
    room.querySelectorAll('[data-music-tab-button]').forEach(button => button.addEventListener('click', () => {
      room.dataset.musicTab = button.dataset.musicTabButton;
      room.querySelectorAll('[data-music-tab-button]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      scrollLyric();
    }));
    list.addEventListener('click', event => {
      const row = event.target.closest('[data-track-index]');
      if (!row || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      const index = Number(row.dataset.trackIndex);
      if (api.state.current === index && api.state.playing) api.toggle(); else api.play(index);
    });
    const cover = room.querySelector('[data-music-cover]');
    cover.addEventListener('error', () => { cover.hidden = true; });
    dispose.push(api.subscribe(s => {
      const track = s.tracks[s.current];
      room.classList.toggle('is-playing', s.playing);
      if (s.tracks !== renderedTracks) {
        renderedTracks = s.tracks;
        const rows = s.tracks.map((item, index) => {
          const row = part('a', 'music-track-row'); row.href = item.url;
          Object.assign(row.dataset, { trackIndex: String(index), trackSearch: `${item.title} ${item.artist}`.toLowerCase() });
          row.append(part('span', 'music-track-number', String(index + 1).padStart(2, '0')));
          const copy = part('span', 'music-track-copy'); copy.append(part('strong', '', item.title), part('small', '', item.artist));
          row.append(copy, part('span', 'music-track-action', '▶')); return row;
        });
        list.replaceChildren(...rows); filter();
      }
      [...list.children].forEach((row, index) => {
        if (index === s.current) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
        row.querySelector('.music-track-action').textContent = index === s.current && s.playing ? 'Ⅱ' : '▶';
      });
      if (track !== renderedTrack) {
        renderedTrack = track; following = true; follow.hidden = true;
        room.querySelector('[data-music-title]').textContent = track?.title || '选择一首音乐';
        room.querySelector('[data-music-artist]').textContent = track?.artist || '让旋律陪你片刻';
        cover.hidden = !track?.cover;
        const background = room.querySelector('.music-atmosphere'); background.hidden = !track?.cover;
        if (track?.cover) { cover.src = track.cover; background.src = track.cover; } else { cover.removeAttribute('src'); background.removeAttribute('src'); }
        const source = room.querySelector('[data-music-source]'); source.hidden = !track;
        if (track) source.href = track.url;
      }
      if (s.lyrics !== renderedLyrics) {
        renderedLyrics = s.lyrics; lyricIndex = -2;
        lyrics.replaceChildren(...s.lyrics.map((line, index) => {
          const button = part('button', 'music-lyric-line', line.text); button.type = 'button'; button.dataset.lyricIndex = index;
          button.addEventListener('click', () => { api.seek(line.time); following = true; follow.hidden = true; scrollLyric(); }); return button;
        }));
      }
      if (!s.lyrics.length) {
        if (!lyrics.firstChild) lyrics.append(part('p', 'music-lyrics-message'));
        lyrics.firstChild.textContent = s.lyricStatus;
      }
      if (lyricIndex !== s.lyricIndex) {
        lyricIndex = s.lyricIndex;
        [...lyrics.children].forEach((node, index) => { if (index === lyricIndex) node.setAttribute('aria-current', 'true'); else node.removeAttribute('aria-current'); });
        scrollLyric();
      }
      room.querySelector('.music-track-count').textContent = `${s.tracks.length} 首`;
      room.querySelector('#music-fetch-status').textContent = s.fetchStatus;
      room.querySelector('#music-retry').hidden = !s.failed;
      room.querySelector('[data-music-status]').textContent = s.status;
      room.querySelector('[data-music-elapsed]').textContent = formatTime(s.time);
      room.querySelector('[data-music-duration]').textContent = formatTime(s.duration);
      const seek = room.querySelector('.music-seek'); seek.disabled = !s.duration; seek.value = s.duration ? s.time / s.duration * 100 : 0;
      seek.setAttribute('aria-valuetext', `${formatTime(s.time)} / ${formatTime(s.duration)}`);
      room.querySelector('.music-volume').value = s.volume;
      const mode = room.querySelector('#music-mode'); mode.textContent = ['顺序', '循环', '单曲', '随机'][s.mode]; mode.setAttribute('aria-label', `播放模式：${modes[s.mode]}`);
    }));
    api.ensure();
  }
  window.addEventListener('pagehide', () => dispose.forEach(unsubscribe => unsubscribe()), { once: true });
})();

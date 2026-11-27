(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
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
    const normalize = (data, remote = false) => (Array.isArray(data) ? data : []).filter(item => item && typeof item === 'object').flatMap(item => {
      const url = safeURL(item.url);
      if (!url) return [];
      const text = value => typeof value === 'string' ? value.trim() : '';
      let qqId = '';
      if (remote && config.remote?.qqAudio && config.remote.server === 'tencent') {
        const params = new URL(url).searchParams;
        const id = params.get('id');
        if (params.get('server') === 'tencent' && params.get('type') === 'url' && /^[a-z\d]{14}$/i.test(id || '')) qqId = id;
      }
      return [{ url, qqId, title: text(item.title) || text(item.name) || t("未命名曲目"), artist: text(item.artist) || text(item.author) || t("未知音乐人"), cover: safeURL(item.cover || item.pic), lrc: safeURL(item.lrc), lyrics: text(item.lyrics) || (typeof item.lrc === 'string' && item.lrc.includes('[0') ? item.lrc : '') }];
    });
    const preferenceKey = `morii-music-preferences:${new URL(hub.dataset.musicPage || '/music/', location.href).pathname}`;
    let preferences;
    try { preferences = JSON.parse(localStorage.getItem(preferenceKey)); } catch { /* Preferences are optional. */ }
    const savedVolume = preferences?.volume;
    const savedMode = preferences?.mode;
    const volume = Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1 ? savedVolume : config.volume ?? .7;
    const mode = Number.isInteger(savedMode) && savedMode >= 0 && savedMode <= 3 ? savedMode : 0;
    const localTracks = normalize(config.tracks);
    const localSources = new Set(localTracks.map(track => track.url));
    const state = { tracks: localTracks, current: 0, playing: false, audioFailed: false, time: 0, duration: 0, volume, mode, status: t("选择一首音乐，开始聆听。"), fetchStatus: '', loading: false, failed: false, lyrics: [], lyricIndex: -1, lyricStatus: t("播放一首歌，让旋律和文字相遇。"), activated: false };
    const savePreferences = () => {
      const { volume, mode } = state;
      try { localStorage.setItem(preferenceKey, JSON.stringify({ volume, mode })); } catch { /* Playback does not depend on storage. */ }
    };
    const emit = () => listeners.forEach(listener => listener(state));
    let playRequest = 0;
    let audioTimeout;
    let lyricRequest = 0;
    let lyricController;
    let loaded = false;
    let loadingPromise;
    const qqAudio = new Map();
    let callbackSerial = 0;
    const requestQQAudio = ids => {
      const callback = `moriiQQAudio${++callbackSerial}`;
      const endpoint = new URL('https://u.y.qq.com/cgi-bin/musicu.fcg');
      endpoint.search = new URLSearchParams({ format: 'jsonp', callback, platform: 'yqq.json', data: JSON.stringify({
        req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param: {
          guid: String(Math.floor(Math.random() * 1e9)), songmid: ids, songtype: ids.map(() => 0), uin: '', loginflag: 1, platform: '20'
        } },
        comm: { uin: '', format: 'json', ct: 24, cv: 0, authst: '' }
      }) });
      return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        const finish = (error, data) => {
          clearTimeout(timeout);
          script.remove();
          delete window[callback];
          if (error) reject(error); else resolve(data);
        };
        const timeout = setTimeout(() => finish(new Error('QQ audio timeout')), 6000);
        window[callback] = response => {
          const data = response?.req_0?.data;
          if (!Array.isArray(data?.midurlinfo) || !Array.isArray(data.sip)) { finish(new Error('QQ audio response')); return; }
          const urls = new Map();
          for (const entry of data.midurlinfo) {
            if (!ids.includes(entry.songmid) || typeof entry.purl !== 'string' || !entry.purl) continue;
            for (const base of data.sip) {
              try {
                const url = new URL(entry.purl, base);
                if (!/^https?:$/.test(url.protocol) || !url.hostname.endsWith('.qq.com') || url.username || url.password) continue;
                url.protocol = 'https:';
                urls.set(entry.songmid, url.href);
                break;
              } catch { /* Try another QQ CDN. */ }
            }
          }
          finish(null, urls);
        };
        script.addEventListener('error', () => finish(new Error('QQ audio request')), { once: true });
        script.src = endpoint.href;
        document.head.append(script);
      });
    };
    const resolveQQAudio = ids => {
      const missing = [...new Set(ids)].filter(id => id && (!qqAudio.has(id) || qqAudio.get(id).until <= Date.now()));
      if (missing.length) {
        const batch = requestQQAudio(missing).catch(() => null);
        for (const id of missing) {
          const entry = { until: Infinity };
          entry.promise = batch.then(result => {
            if (!result) { if (qqAudio.get(id) === entry) qqAudio.delete(id); return null; }
            entry.url = result.get(id) || '';
            entry.until = Date.now() + (entry.url ? 240000 : 30000);
            return entry.url;
          });
          qqAudio.set(id, entry);
        }
      }
      return ids.map(id => qqAudio.get(id));
    };
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
      state.lyrics = []; state.lyricIndex = -1; state.lyricStatus = t("正在加载歌词…"); emit();
      try {
        let text = track.lyrics;
        if (!text && track.lrc) {
          if (lyricCache.has(track.lrc)) text = lyricCache.get(track.lrc);
          else { text = await timedFetch(track.lrc, 'text', lyricController); lyricCache.set(track.lrc, text); }
        }
        if (token !== lyricRequest) return;
        state.lyrics = parseLyrics(text || '');
        state.lyricStatus = state.lyrics.length ? '' : t("暂无同步歌词，静静听一会儿。");
      } catch {
        if (token !== lyricRequest) return;
        state.lyricStatus = t("歌词暂时无法加载，音乐仍可继续播放。");
      }
      emit();
    };
    const prepare = index => {
      if (!state.tracks[index]) return;
      state.current = index; state.time = 0; state.duration = 0;
      const track = state.tracks[index];
      if (track.qqId) {
        if (player.hasAttribute('src')) { player.pause(); player.removeAttribute('src'); }
        resolveQQAudio(state.tracks.slice(index, index + 4).map(item => item.qqId));
      } else player.src = track.url;
      loadLyrics(track);
    };
    const clearAudioTimeout = () => {
      clearTimeout(audioTimeout);
      audioTimeout = undefined;
    };
    const failAudio = message => {
      clearAudioTimeout();
      state.playing = false;
      state.audioFailed = true;
      state.status = message;
      emit();
    };
    const unavailableAudio = () => t("这首歌曲暂时无法播放，可以切换下一首或打开原平台歌单。");
    const play = async index => {
      const track = state.tracks[index];
      if (!track) return;
      const token = ++playRequest;
      clearAudioTimeout();
      const retry = state.audioFailed && index === state.current;
      state.audioFailed = false;
      state.playing = false;
      if (retry && track.qqId && player.error) qqAudio.delete(track.qqId);
      if (index !== state.current || (!track.qqId && !player.getAttribute('src'))) prepare(index);
      state.activated = true; state.status = t("正在加载音频…"); emit();
      audioTimeout = setTimeout(() => {
        if (token !== playRequest) return;
        ++playRequest;
        failAudio(t("音频加载超时，请重试或打开原平台歌单。"));
        player.pause();
      }, 12000);
      try {
        const existing = track.qqId && !retry && player.getAttribute('src');
        const entry = track.qqId && !existing ? resolveQQAudio([track.qqId])[0] : null;
        const url = entry ? (entry.url ?? await entry.promise) : existing || track.url;
        if (token !== playRequest) return;
        if (url === '') { failAudio(t("QQ 音乐暂未开放这首歌的匿名播放，可前往原平台收听。")); return; }
        const source = url || track.url;
        if (player.getAttribute('src') !== source) player.src = source;
        else if (retry) player.load();
        await player.play();
      }
      catch (error) {
        if (token !== playRequest || error?.name === 'AbortError') return;
        if (!state.audioFailed) failAudio(error?.name === 'NotAllowedError' ? t("浏览器暂停了播放，请再次点击播放。") : unavailableAudio());
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
        loaded = true; state.fetchStatus = state.tracks.length ? t("{0} 首本地曲目", state.tracks.length) : t("暂未配置歌单。");
        if (state.tracks.length && !player.getAttribute('src')) prepare(0);
        emit(); return Promise.resolve();
      }
      const cacheKey = `morii-music:${config.remote.server}:${config.remote.type}:${config.remote.id}`;
      if (!loaded) {
        try {
          const cached = JSON.parse(sessionStorage.getItem(cacheKey) || 'null');
          const tracks = cached && Date.now() - cached.at < 1800000 ? normalize(cached.tracks, true) : [];
          if (tracks.length) {
            state.tracks = [...localTracks, ...tracks.filter(track => !localSources.has(track.url))]; prepare(0); loaded = true;
            state.fetchStatus = t("已获取 {0} 首歌曲", tracks.length);
            emit(); return Promise.resolve();
          }
        } catch { /* Continue with the network when storage is unavailable. */ }
      }
      state.loading = true; state.failed = false; state.fetchStatus = t("正在获取歌单…"); emit();
      loadingPromise = (async () => {
        try {
          const values = { ...config.remote, r: String(Math.random()) };
          const endpoint = safeURL(config.remote.api.replace(/:(server|type|id|r)\b/g, (_, key) => encodeURIComponent(values[key])));
          if (!endpoint) throw new Error('invalid endpoint');
          const tracks = normalize(await timedFetch(endpoint, 'json', new AbortController(), 8000), true);
          if (!tracks.length) throw new Error('empty playlist');
          if (state.activated) { state.fetchStatus = t("当前播放队列已保留。"); return; }
          state.tracks = [...localTracks, ...tracks.filter(track => !localSources.has(track.url))]; prepare(0); loaded = true;
          state.fetchStatus = t("已获取 {0} 首歌曲", tracks.length);
          try { sessionStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), tracks })); } catch { /* Playback does not depend on storage. */ }
        } catch {
          state.failed = true;
          state.fetchStatus = state.tracks.length ? t("在线歌单获取失败，可播放本地曲目。") : t("歌单获取失败，请重试或打开原平台歌单。");
          if (state.tracks.length && !player.getAttribute('src')) prepare(0);
        } finally { state.loading = false; loadingPromise = null; emit(); }
      })();
      return loadingPromise;
    };
    player.volume = state.volume;
    player.addEventListener('playing', () => {
      if (state.audioFailed) return;
      clearAudioTimeout(); state.playing = true;
      state.status = t("正在播放：{0}", state.tracks[state.current]?.title || ''); emit();
    });
    player.addEventListener('pause', () => {
      state.playing = false;
      if (!state.audioFailed && !audioTimeout && !player.error) state.status = t("已暂停，可以随时继续。");
      emit();
    });
    player.addEventListener('error', () => { if (state.tracks.length && !state.audioFailed) failAudio(unavailableAudio()); });
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
      else { state.playing = false; state.status = t("已听完全部曲目。"); emit(); }
    });
    api = {
      state, player, parseLyrics,
      subscribe(listener) { listeners.add(listener); listener(state); return () => listeners.delete(listener); },
      load, ensure() { return loaded ? Promise.resolve() : load(); }, play,
      toggle() {
        if (!state.tracks.length) return load();
        if (player.paused || state.audioFailed) return play(state.current);
        ++playRequest; clearAudioTimeout(); player.pause();
      },
      step(direction) { if (state.tracks.length) return play(nextIndex(direction)); },
      seek(time) { if (Number.isFinite(time) && Number.isFinite(player.duration) && player.duration > 0) { player.currentTime = Math.max(0, Math.min(player.duration, time)); player.dispatchEvent(new Event('timeupdate')); } },
      volume(value) { state.volume = Math.max(0, Math.min(1, Number(value) || 0)); player.volume = state.volume; savePreferences(); emit(); },
      mode() { state.mode = (state.mode + 1) % 4; savePreferences(); emit(); }
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
    let chromeObserver;
    let readyTimer;
    let fallbackTimer;
    const scrollPositions = new Map();
    let entrySerial = 0;
    let activeEntry = 'origin';
    let pendingStarted = 0;
    let notice;
    const recordScroll = () => {
      if (document.body.classList.contains('music-shell-loading') || shellActive && frame?.hidden) return;
      try { const view = shellActive && frame && !frame.hidden ? frame.contentWindow : window; if (view.location.href === currentURL) scrollPositions.set(activeEntry, { x: view.scrollX, y: view.scrollY }); } catch { /* Same-origin pages only. */ }
    };
    const restoreScroll = view => {
      const position = scrollPositions.get(activeEntry);
      view.requestAnimationFrame(() => {
        if (position) view.scrollTo(position.x, position.y);
        else if (new URL(currentURL).hash) {
          try { view.document.getElementById(decodeURIComponent(new URL(currentURL).hash.slice(1)))?.scrollIntoView(); } catch { /* Invalid fragment. */ }
        } else view.scrollTo(0, 0);
      });
    };
    const announceNavigation = status => window.dispatchEvent(new CustomEvent('morii:navigation', { detail: { url: currentURL, status, duration: Math.round(performance.now() - pendingStarted) } }));
    const failure = () => {
      clearInterval(readyTimer); clearTimeout(fallbackTimer);
      document.body.classList.remove('music-shell-loading');
      announceNavigation('timeout');
      if (!notice) {
        notice = document.createElement('div'); notice.className = 'music-navigation-notice'; notice.setAttribute('role', 'status');
        const text = document.createElement('span'); text.textContent = t("页面加载较慢，可以重试或直接打开。");
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = t("重试"); retry.addEventListener('click', () => visit(currentURL, false, activeEntry));
        const direct = document.createElement('a'); direct.textContent = t("直接打开"); direct.dataset.noMusicNav = '';
        const close = document.createElement('button'); close.type = 'button'; close.textContent = '×'; close.setAttribute('aria-label', t("关闭")); close.addEventListener('click', () => { notice.hidden = true; });
        notice.append(text, retry, direct, close); document.body.append(notice);
      }
      notice.querySelector('a').href = currentURL; notice.hidden = false;
    };
    const musicPath = new URL(hub.dataset.musicPage, location.href).pathname;
    const updateFloating = () => {
      const inRoom = new URL(currentURL).pathname === musicPath;
      hub.querySelector('.music-float').hidden = !state.tracks.length || inRoom;
    };
    const visit = (url, push = true, entry) => {
      recordScroll();
      chromeObserver?.disconnect();
      if (notice) notice.hidden = true;
      if (history.scrollRestoration !== 'manual') {
        history.scrollRestoration = 'manual';
        history.replaceState({ ...history.state, moriiMusicKey: activeEntry }, '', location.href);
      }
      activeEntry = push ? `morii-${++entrySerial}` : entry || 'origin';
      if (push) history.pushState({ moriiMusic: true, moriiMusicKey: activeEntry }, '', url);
      pendingStarted = performance.now();
      currentURL = url; updateFloating();
      clearInterval(readyTimer); clearTimeout(fallbackTimer);
      if (new URL(url).pathname === originURL.pathname && new URL(url).search === originURL.search) {
        shellActive = false; document.body.classList.remove('music-shell-active', 'music-shell-loading');
        document.documentElement.style.removeProperty('--frame-chrome');
        if (frame) frame.hidden = true;
        document.title = originTitle;
        document.getElementById('main')?.setAttribute('tabindex', '-1');
        document.getElementById('main')?.focus({ preventScroll: true });
        restoreScroll(window); announceNavigation('ready');
        window.dispatchEvent(new Event('morii:music-view')); return;
      }
      shellActive = true; document.body.classList.add('music-shell-loading');
      if (!frame) {
        frame = document.createElement('iframe'); frame.id = 'morii-site-frame'; frame.title = t("网站内容");
        frame.addEventListener('load', showFrame);
        document.body.append(frame);
      }
      const oldDocument = frame.contentDocument;
      pendingDocument = oldDocument;
      if (!document.body.classList.contains('music-shell-active')) frame.hidden = true;
      frame.contentWindow.location.replace(url);
      readyTimer = setInterval(showFrame, 80);
      fallbackTimer = setTimeout(failure, 12000);
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
        const frameChrome = content.querySelector('meta[name="theme-color"]');
        const chrome = document.querySelector('meta[name="theme-color"]');
        if (frameChrome && chrome) {
          const syncChrome = () => {
            chrome.content = frameChrome.content;
            document.documentElement.style.setProperty('--frame-chrome', frameChrome.content);
          };
          syncChrome();
          chromeObserver = new MutationObserver(syncChrome);
          chromeObserver.observe(frameChrome, { attributeFilter: ['content'] });
        }
        document.title = content.title;
        frame.title = content.title || t("网站内容");
        bindNavigation(content); updateFloating();
        restoreScroll(frame.contentWindow); announceNavigation('ready');
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
    window.addEventListener('popstate', event => { if (frame || shellActive) visit(location.href, false, event.state?.moriiMusicKey); });
    window.addEventListener('pagehide', () => { recordScroll(); clearInterval(readyTimer); clearTimeout(fallbackTimer); });
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
      ball.setAttribute('aria-label', s.playing ? t("暂停音乐") : t("播放音乐"));
      hub.querySelector('.music-ball-state').textContent = s.playing ? 'Ⅱ' : '▶';
      hub.querySelector('.music-capsule-progress').style.transform = `scaleX(${s.duration ? Math.min(1, s.time / s.duration) : 0})`;
      trackButton.title = t("{0} · 点击展开或收起歌词", track?.title || t("音乐馆"));
      hub.querySelectorAll('[data-music-title]').forEach(node => { node.textContent = track?.title || t("未选择音乐"); });
      hub.querySelectorAll('[data-music-artist]').forEach(node => { node.textContent = track?.artist || ''; });
      hub.querySelector('[data-music-mini-lyric]').textContent = s.lyrics[s.lyricIndex]?.text || s.lyricStatus || t("让音乐陪你继续探索。");
      hub.querySelector('[data-music-status]').textContent = s.status;
      ball.title = `${track?.title || t("音乐馆")} · ${s.playing ? t("正在播放") : t("已暂停")}`;
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
  const modes = [t("顺序播放"), t("列表循环"), t("单曲循环"), t("随机播放")];
  const bindControls = root => {
    root.querySelectorAll('[data-music-action]').forEach(button => button.addEventListener('click', () => {
      const action = button.dataset.musicAction;
      if (action === 'toggle') api.toggle();
      else if (action === 'previous' || action === 'next') api.step(action === 'next' ? 1 : -1);
      else if (action === 'mode') api.mode();
    }));
    return api.subscribe(s => {
      root.querySelectorAll('[data-music-toggle]').forEach(button => { button.disabled = !s.tracks.length; button.toggleAttribute('data-playing', s.playing); button.setAttribute('aria-label', s.playing ? t("暂停") : t("播放")); });
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
    const recovery = room.querySelector('.music-audio-recovery');
    recovery.querySelector('button').addEventListener('click', () => api.play(api.state.current));
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
    const background = room.querySelector('.music-atmosphere');
    const compactRoom = window.matchMedia?.('(max-width: 760px), (max-width: 960px) and (pointer:coarse)');
    const syncBackground = () => {
      const url = compactRoom?.matches ? '' : api.state.tracks[api.state.current]?.cover;
      background.hidden = !url;
      if (url && background.getAttribute('src') !== url) background.src = url;
      if (!url) background.removeAttribute('src');
    };
    compactRoom?.addEventListener?.('change', syncBackground);
    dispose.push(() => compactRoom?.removeEventListener?.('change', syncBackground));
    let activeRow;
    let rowPlaying;
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
      const row = list.children[s.current];
      if (activeRow !== row) {
        if (activeRow) {
          activeRow.removeAttribute('aria-current');
          activeRow.querySelector('.music-track-action').textContent = '▶';
        }
        activeRow = row;
        activeRow?.setAttribute('aria-current', 'true');
        rowPlaying = undefined;
      }
      if (activeRow && rowPlaying !== s.playing) {
        rowPlaying = s.playing;
        activeRow.querySelector('.music-track-action').textContent = s.playing ? 'Ⅱ' : '▶';
      }
      if (track !== renderedTrack) {
        renderedTrack = track; following = true; follow.hidden = true;
        room.querySelector('[data-music-title]').textContent = track?.title || t("选择一首音乐");
        room.querySelector('[data-music-artist]').textContent = track?.artist || t("让旋律陪你片刻");
        cover.hidden = !track?.cover;
        if (track?.cover) cover.src = track.cover; else cover.removeAttribute('src');
        syncBackground();
        const source = room.querySelector('[data-music-source]'); source.hidden = !track;
        if (track) {
          source.href = track.qqId ? `https://i2.y.qq.com/a/song/${track.qqId}` : track.url;
          source.textContent = track.qqId ? t("在 QQ 音乐打开这首歌 ↗") : t("打开音频原链接 ↗");
        }
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
      room.querySelector('.music-track-count').textContent = t("{0} 首", s.tracks.length);
      room.querySelector('#music-fetch-status').textContent = s.fetchStatus;
      room.querySelector('#music-retry').hidden = !s.failed;
      room.querySelector('[data-music-status]').textContent = s.status;
      recovery.hidden = !s.audioFailed;
      room.querySelector('[data-music-elapsed]').textContent = formatTime(s.time);
      room.querySelector('[data-music-duration]').textContent = formatTime(s.duration);
      const seek = room.querySelector('.music-seek'); seek.disabled = !s.duration; seek.value = s.duration ? s.time / s.duration * 100 : 0;
      seek.setAttribute('aria-valuetext', `${formatTime(s.time)} / ${formatTime(s.duration)}`);
      room.querySelector('.music-volume').value = s.volume;
      const mode = room.querySelector('#music-mode'); mode.textContent = [t("顺序"), t("循环"), t("单曲"), t("随机")][s.mode]; mode.setAttribute('aria-label', t("播放模式：{0}", modes[s.mode]));
    }));
    api.ensure();
  }
  window.addEventListener('pagehide', () => dispose.forEach(unsubscribe => unsubscribe()), { once: true });
})();

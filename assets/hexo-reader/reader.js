(function () {
  'use strict';

  function formatTime(sec) {
    if (!isFinite(sec) || sec < 0) {
      return '0:00';
    }
    var s = Math.floor(sec);
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' + r : r);
  }

  var readerCount = 0;

  function initReader(root) {
    if (!root || root.__hexoReaderBound) {
      return;
    }
    root.__hexoReaderBound = true;

    var audio = root.querySelector('.hexo-reader__audio');
    var panel = root.querySelector('.hexo-reader__panel');
    var playBtn = root.querySelector('.hexo-reader__play');
    var launcher = root.querySelector('.hexo-reader__launcher');
    var header = root.querySelector('.hexo-reader__header');
    var collapseBtn = root.querySelector('.hexo-reader__collapse');
    var statusLabel = root.querySelector('.hexo-reader__status');
    var timeLabel = root.querySelector('.hexo-reader__time');
    var seek = root.querySelector('.hexo-reader__seek');
    var rateBtns = root.querySelectorAll('.hexo-reader__rate');
    var rateToggle = root.querySelector('.hexo-reader__speed-toggle');
    var rateMenu = root.querySelector('.hexo-reader__rates');
    var rateValue = root.querySelector('.hexo-reader__rate-value');
    var skipBtns = root.querySelectorAll('.hexo-reader__skip');
    var playLabel = root.getAttribute('data-label-play') || '播放';
    var pauseLabel = root.getAttribute('data-label-pause') || '暂停';
    function label(name, fallback) {
      return root.getAttribute('data-label-' + name) || fallback;
    }

    if (!audio || !panel || !playBtn || !launcher) {
      return;
    }

    readerCount += 1;
    panel.id = 'hexo-reader-panel-' + readerCount;
    launcher.setAttribute('aria-controls', panel.id);
    rateMenu.id = 'hexo-reader-rates-' + readerCount;
    rateToggle.setAttribute('aria-controls', rateMenu.id);

    function fitPanel() {
      if (!root.classList.contains('is-expanded') || root.hasAttribute('data-demo')) return;
      // Measure the final layout, independent of the opening/closing transform.
      var anchor = root.getBoundingClientRect();
      var left = anchor.left + panel.offsetLeft;
      var top = anchor.top + panel.offsetTop;
      var rect = { left: left, top: top, right: left + panel.offsetWidth, bottom: top + panel.offsetHeight };
      var dx = rect.left < 8 ? 8 - rect.left : Math.min(0, window.innerWidth - 8 - rect.right);
      var dy = rect.top < 8 ? 8 - rect.top : Math.min(0, window.innerHeight - 8 - rect.bottom);
      panel.style.setProperty('--hr-shift-x', dx + 'px');
      panel.style.setProperty('--hr-shift-y', dy + 'px');
    }

    function closeRates() {
      rateMenu.hidden = true;
      rateToggle.setAttribute('aria-expanded', 'false');
    }

    function setExpanded(expanded) {
      root.classList.toggle('is-expanded', !!expanded);
      launcher.setAttribute('aria-expanded', String(!!expanded));
      launcher.toggleAttribute('inert', !!expanded);
      launcher.setAttribute('aria-hidden', String(!!expanded));
      panel.toggleAttribute('inert', !expanded);
      panel.setAttribute('aria-hidden', String(!expanded));
      if (expanded) fitPanel();
      else closeRates();
    }

    function setPlayingIcon(playing) {
      playBtn.classList.toggle('is-playing', !!playing);
      root.classList.toggle('is-playing', !!playing);
      playBtn.setAttribute('aria-label', playing ? pauseLabel : playLabel);
      if (statusLabel && !root.classList.contains('is-error')) {
        statusLabel.textContent = playing ? label('playing', '正在朗读') : label('paused', '已暂停');
      }
    }

    launcher.addEventListener('click', function (e) {
      if (root.__hexoReaderDragged) {
        root.__hexoReaderDragged = false;
        e.preventDefault();
        return;
      }
      var opening = !root.classList.contains('is-expanded');
      setExpanded(opening);
      if (opening) playBtn.focus({ preventScroll: true });
    });
    root.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (!rateMenu.hidden) {
        closeRates();
        rateToggle.focus({ preventScroll: true });
      } else if (root.classList.contains('is-expanded')) {
        setExpanded(false);
        launcher.focus({ preventScroll: true });
      }
    });
    document.addEventListener('pointerdown', function (e) {
      if (!root.contains(e.target)) {
        closeRates();
        if (!root.hasAttribute('data-demo')) setExpanded(false);
      } else if (!root.querySelector('.hexo-reader__speed-picker').contains(e.target)) {
        closeRates();
      }
    });
    root.addEventListener('focusout', function (e) {
      if (!root.contains(e.relatedTarget)) closeRates();
    });
    collapseBtn.addEventListener('click', function () {
      setExpanded(false);
      launcher.focus({ preventScroll: true });
    });

    function setTime(current, duration) {
      if (!timeLabel) return;
      timeLabel.querySelector('.hexo-reader__elapsed').textContent = formatTime(current);
      timeLabel.querySelector('.hexo-reader__duration').textContent = formatTime(duration);
    }

    function updateSeekFill() {
      if (!seek) {
        return;
      }
      var max = Number(seek.max) || 1000;
      var pct = max > 0 ? (Number(seek.value) / max) * 100 : 0;
      seek.style.setProperty('--hr-progress', pct + '%');
      root.style.setProperty('--hr-progress', pct + '%');
    }

    playBtn.addEventListener('click', function (e) {
      if (root.__hexoReaderDragged) {
        root.__hexoReaderDragged = false;
        e.preventDefault();
        return;
      }
      if (audio.paused) {
        audio.play().catch(function () {
          root.classList.add('is-error');
          setPlayingIcon(false);
          if (statusLabel) { statusLabel.textContent = label('failed', '播放失败'); }
        });
      } else {
        audio.pause();
      }
    });

    for (var skipIndex = 0; skipIndex < skipBtns.length; skipIndex++) {
      skipBtns[skipIndex].addEventListener('click', function () {
        var amount = Number(this.getAttribute('data-skip'));
        if (!isFinite(amount)) return;
        var end = isFinite(audio.duration) ? audio.duration : Infinity;
        audio.currentTime = Math.max(0, Math.min(end, audio.currentTime + amount));
      });
    }

    audio.addEventListener('play', function () {
      root.classList.remove('is-error');
      setPlayingIcon(true);
      var others = document.querySelectorAll('.hexo-reader__audio');
      for (var i = 0; i < others.length; i++) {
        if (others[i] !== audio && !others[i].paused) { others[i].pause(); }
      }
    });
    audio.addEventListener('pause', function () { setPlayingIcon(false); });
    audio.addEventListener('ended', function () {
      setPlayingIcon(false);
      if (statusLabel) { statusLabel.textContent = label('ended', '播放完成'); }
    });

    audio.addEventListener('timeupdate', function () {
      if (timeLabel) {
        setTime(audio.currentTime, audio.duration);
      }
      if (seek) seek.setAttribute('aria-valuetext', formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration));
      if (seek && isFinite(audio.duration) && audio.duration > 0) {
        var v = Math.round((audio.currentTime / audio.duration) * 1000);
        if (!seek.__seeking) {
          seek.value = String(v);
          updateSeekFill();
        }
      }
    });

    audio.addEventListener('loadedmetadata', function () {
      if (timeLabel) {
        setTime(audio.currentTime, audio.duration);
      }
    });

    audio.addEventListener('error', function () {
      root.classList.add('is-error');
      setPlayingIcon(false);
      if (statusLabel) { statusLabel.textContent = label('load-failed', '音频加载失败'); }

    });

    if (seek) {
      seek.addEventListener('mousedown', function () { seek.__seeking = true; });
      seek.addEventListener('touchstart', function () { seek.__seeking = true; }, { passive: true });
      seek.addEventListener('change', function () {
        if (isFinite(audio.duration) && audio.duration > 0) {
          audio.currentTime = (Number(seek.value) / 1000) * audio.duration;
        }
        seek.__seeking = false;
        updateSeekFill();
      });
      seek.addEventListener('input', function () {
        updateSeekFill();
        if (isFinite(audio.duration) && audio.duration > 0 && timeLabel) {
          var t = (Number(seek.value) / 1000) * audio.duration;
          setTime(t, audio.duration);
        }
      });
      updateSeekFill();
    }

    var rateKey = 'hexo-reader-rate';
    function setRate(value) {
      var selected = null;
      for (var i = 0; i < rateBtns.length; i++) {
        if (rateBtns[i].getAttribute('data-rate') === String(value)) selected = rateBtns[i];
      }
      if (!selected) return;
      audio.playbackRate = Number(value);
      rateValue.textContent = value + '×';
      for (var j = 0; j < rateBtns.length; j++) {
        rateBtns[j].setAttribute('aria-pressed', String(rateBtns[j] === selected));
      }
      try { window.localStorage.setItem(rateKey, String(value)); } catch (e) {}
    }
    rateToggle.addEventListener('click', function () {
      var opening = rateMenu.hidden;
      rateMenu.hidden = !opening;
      rateToggle.setAttribute('aria-expanded', String(opening));
      if (opening) rateMenu.querySelector('[aria-pressed="true"]').focus({ preventScroll: true });
    });
    for (var k = 0; k < rateBtns.length; k++) {
      rateBtns[k].addEventListener('click', function () {
        setRate(this.getAttribute('data-rate'));
        closeRates();
        rateToggle.focus({ preventScroll: true });
      });
    }
    try { setRate(window.localStorage.getItem(rateKey) || '1'); } catch (e) {}
    setExpanded(root.classList.contains('is-expanded'));
    if (!root.hasAttribute('data-demo')) setupDrag(root, launcher, header, fitPanel);
    window.addEventListener('resize', fitPanel);
  }

  var POS_KEY = 'hexo-reader-pos';
  var DRAG_THRESHOLD = 5;
  var EDGE_MARGIN = 8;

  function clamp(value, min, max) {
    return value < min ? min : (value > max ? max : value);
  }

  function readStoredPos() {
    try {
      var raw = window.localStorage.getItem(POS_KEY);
      if (!raw) {
        return null;
      }
      var o = JSON.parse(raw);
      if (o && (o.hx === 'left' || o.hx === 'right') && (o.vy === 'top' || o.vy === 'bottom') &&
          typeof o.x === 'number' && typeof o.y === 'number') {
        return o;
      }
    } catch (e) {}
    return null;
  }

  function storePos(pos) {
    try {
      window.localStorage.setItem(POS_KEY, JSON.stringify(pos));
    } catch (e) {}
  }

  function clearStoredPos() {
    try {
      window.localStorage.removeItem(POS_KEY);
    } catch (e) {}
  }

  function setupDrag(root, playBtn, header, fitPanel) {
    function clearAnchorClasses() {
      root.classList.remove(
        'is-floating', 'is-grow-left', 'is-grow-right', 'is-pin-top', 'is-pin-bottom'
      );
    }

    /* Anchor the FAB to the corner of the viewport it currently sits closest to,
     * so subsequent expand/collapse grows toward the interior without moving it. */
    function applyAnchor(pos) {
      clearAnchorClasses();
      root.classList.add('is-floating');
      root.classList.add(pos.hx === 'right' ? 'is-grow-left' : 'is-grow-right');
      root.classList.add(pos.vy === 'bottom' ? 'is-pin-bottom' : 'is-pin-top');
      if (pos.hx === 'right') {
        root.style.right = pos.x + 'px';
        root.style.left = 'auto';
      } else {
        root.style.left = pos.x + 'px';
        root.style.right = 'auto';
      }
      if (pos.vy === 'bottom') {
        root.style.bottom = pos.y + 'px';
        root.style.top = 'auto';
      } else {
        root.style.top = pos.y + 'px';
        root.style.bottom = 'auto';
      }
    }

    function clearPos() {
      clearAnchorClasses();
      root.style.left = '';
      root.style.top = '';
      root.style.right = '';
      root.style.bottom = '';
    }

    /* Derive a corner-anchored position from the FAB's current viewport rect,
     * clamped to stay fully on screen. */
    function commitFromFab() {
      // The launcher scales during transitions; the root retains its anchor size.
      var fab = root.getBoundingClientRect();
      var vw = window.innerWidth;
      var vh = window.innerHeight;
      var maxLeft = Math.max(EDGE_MARGIN, vw - fab.width - EDGE_MARGIN);
      var maxTop = Math.max(EDGE_MARGIN, vh - fab.height - EDGE_MARGIN);
      var fl = clamp(fab.left, EDGE_MARGIN, maxLeft);
      var ft = clamp(fab.top, EDGE_MARGIN, maxTop);
      var pos = { hx: 'left', x: 0, vy: 'top', y: 0 };
      if (fl + fab.width / 2 < vw / 2) {
        pos.hx = 'left';
        pos.x = Math.round(fl);
      } else {
        pos.hx = 'right';
        pos.x = Math.round(vw - (fl + fab.width));
      }
      if (ft + fab.height / 2 < vh / 2) {
        pos.vy = 'top';
        pos.y = Math.round(ft);
      } else {
        pos.vy = 'bottom';
        pos.y = Math.round(vh - (ft + fab.height));
      }
      applyAnchor(pos);
      storePos(pos);
      return pos;
    }

    var stored = readStoredPos();
    if (stored) {
      applyAnchor(stored);
    }

    window.addEventListener('resize', function () {
      if (root.classList.contains('is-floating')) {
        commitFromFab();
      }
    });

    function makeDraggable(handle) {
      if (!handle) {
        return;
      }
      handle.style.touchAction = 'none';
      handle.addEventListener('pointerdown', function (e) {
        if (e.target.closest && e.target.closest('.hexo-reader__collapse')) {
          return;
        }
        root.__hexoReaderPointerType = e.pointerType;
        if (e.button != null && e.button !== 0) {
          return;
        }
        var pointerId = e.pointerId;
        var startX = e.clientX;
        var startY = e.clientY;
        var startLeft = 0;
        var startTop = 0;
        var moved = false;
        var wasExpanded = root.classList.contains('is-expanded');
        root.__hexoReaderDragged = false;

        function moveTo(left, top) {
          var w = root.offsetWidth || 0;
          var h = root.offsetHeight || 0;
          var maxLeft = Math.max(EDGE_MARGIN, window.innerWidth - w - EDGE_MARGIN);
          var maxTop = Math.max(EDGE_MARGIN, window.innerHeight - h - EDGE_MARGIN);
          root.style.left = clamp(left, EDGE_MARGIN, maxLeft) + 'px';
          root.style.top = clamp(top, EDGE_MARGIN, maxTop) + 'px';
          root.style.right = 'auto';
          root.style.bottom = 'auto';
          fitPanel();
        }

        function onMove(ev) {
          if (ev.pointerId !== pointerId) {
            return;
          }
          var dx = ev.clientX - startX;
          var dy = ev.clientY - startY;
          if (!moved && Math.abs(dx) + Math.abs(dy) < DRAG_THRESHOLD) {
            return;
          }
          if (!moved) {
            moved = true;
            // Capture only once an actual drag starts, so taps/double-clicks
            // (which never move) keep firing native click/dblclick events.
            try { handle.setPointerCapture(pointerId); } catch (err) {}
            // Freeze the grab-time size so nothing reflows under the cursor.
            root.classList.add('is-dragging');
            if (wasExpanded) {
              root.classList.add('is-drag-expanded');
            }
            // Neutralise to left/top anchoring at the current visual position.
            var r = root.getBoundingClientRect();
            startLeft = r.left;
            startTop = r.top;
            startX = ev.clientX;
            startY = ev.clientY;
            dx = 0;
            dy = 0;
          }
          moveTo(startLeft + dx, startTop + dy);
        }

        function onUp(ev) {
          if (ev && ev.pointerId !== pointerId) {
            return;
          }
          document.removeEventListener('pointermove', onMove);
          document.removeEventListener('pointerup', onUp);
          document.removeEventListener('pointercancel', onUp);
          if (moved) {
            root.classList.remove('is-dragging');
            root.classList.remove('is-drag-expanded');
            root.__hexoReaderDragged = handle === playBtn;
            commitFromFab();
            fitPanel();
          }
        }

        document.addEventListener('pointermove', onMove);
        document.addEventListener('pointerup', onUp);
        document.addEventListener('pointercancel', onUp);
      });

      handle.addEventListener('dblclick', function (e) {
        e.preventDefault();
        clearStoredPos();
        clearPos();
        root.__hexoReaderDragged = false;
        fitPanel();
      });
    }

    makeDraggable(playBtn);
    makeDraggable(header);
  }

  function boot() {
    var roots = document.querySelectorAll('.hexo-reader');
    for (var i = 0; i < roots.length; i++) {
      initReader(roots[i]);
    }
  }

  window.hexoReaderBoot = boot;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();

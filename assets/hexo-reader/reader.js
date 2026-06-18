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

  function initReader(root) {
    if (!root || root.__hexoReaderBound) {
      return;
    }
    root.__hexoReaderBound = true;

    var audio = root.querySelector('.hexo-reader__audio');
    var panel = root.querySelector('.hexo-reader__panel');
    var playBtn = root.querySelector('.hexo-reader__play');
    var header = root.querySelector('.hexo-reader__header');
    var timeLabel = root.querySelector('.hexo-reader__time');
    var seek = root.querySelector('.hexo-reader__seek');
    var rateBtns = root.querySelectorAll('.hexo-reader__rate');

    if (!audio || !panel || !playBtn) {
      return;
    }

    function setExpanded(expanded) {
      root.classList.toggle('is-expanded', !!expanded);
    }

    function setPlayingIcon(playing) {
      playBtn.classList.toggle('is-playing', !!playing);
      playBtn.setAttribute('aria-label', playing ? '暂停' : '播放');
    }

    function updateSeekFill() {
      if (!seek) {
        return;
      }
      var max = Number(seek.max) || 1000;
      var pct = max > 0 ? (Number(seek.value) / max) * 100 : 0;
      seek.style.setProperty('--hr-progress', pct + '%');
    }

    playBtn.addEventListener('click', function (e) {
      if (root.__hexoReaderDragged) {
        root.__hexoReaderDragged = false;
        e.preventDefault();
        return;
      }
      if (audio.paused) {
        audio.play().catch(function () {});
      } else {
        audio.pause();
      }
    });

    audio.addEventListener('play', function () {
      setPlayingIcon(true);
      // Pointer (mouse/pen) devices rely purely on hover to expand/collapse, so
      // playback must not pin the panel open. Touch has no hover, so a tap-play
      // expands the controls there.
      if (root.__hexoReaderPointerType === 'touch') {
        setExpanded(true);
      }
    });
    audio.addEventListener('pause', function () { setPlayingIcon(false); });
    audio.addEventListener('ended', function () { setPlayingIcon(false); });

    audio.addEventListener('timeupdate', function () {
      if (timeLabel) {
        timeLabel.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
      }
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
        timeLabel.textContent = formatTime(audio.currentTime) + ' / ' + formatTime(audio.duration);
      }
    });

    audio.addEventListener('error', function () {
      if (timeLabel) {
        timeLabel.textContent = '加载失败';
      }
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
          timeLabel.textContent = formatTime(t) + ' / ' + formatTime(audio.duration);
        }
      });
      updateSeekFill();
    }

    if (rateBtns && rateBtns.length) {
      var setRate = function (btn) {
        var v = parseFloat(btn.getAttribute('data-rate'));
        if (isFinite(v) && v > 0) {
          audio.playbackRate = v;
        }
        for (var j = 0; j < rateBtns.length; j++) {
          rateBtns[j].setAttribute('aria-pressed', rateBtns[j] === btn ? 'true' : 'false');
        }
      };
      for (var k = 0; k < rateBtns.length; k++) {
        (function (btn) {
          btn.addEventListener('click', function () { setRate(btn); });
        })(rateBtns[k]);
      }
    }

    setupDrag(root, playBtn, header);
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

  function setupDrag(root, playBtn, header) {
    var audio = root.querySelector('.hexo-reader__audio');
    var body = root.querySelector('.hexo-reader__body');

    root.addEventListener('pointerleave', function (e) {
      root.classList.remove('is-hover-suppressed');
      // On pointer (mouse/pen) devices, leaving the player collapses it back to
      // the FAB even while audio keeps playing. Touch has no hover, so a tapped
      // play stays expanded until the collapse button is used.
      if (e.pointerType !== 'touch') {
        root.classList.remove('is-expanded');
      }
    });

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
      var fab = playBtn.getBoundingClientRect();
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
        var wasExpanded = !!(body && window.getComputedStyle(body).display !== 'none');
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
            root.__hexoReaderDragged = true;
            commitFromFab();
            root.classList.add('is-hover-suppressed');
            if (audio && audio.paused) {
              root.classList.remove('is-expanded');
            }
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

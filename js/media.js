(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  const dialog = document.getElementById('image-dialog');
  const preview = document.getElementById('image-preview');
  const caption = document.getElementById('image-caption');
  const selector = '.article-body img:not(.content-inline-image), .photo-card img, .essay-images img';
  const previous = document.getElementById('image-previous');
  const next = document.getElementById('image-next');
  const counter = document.getElementById('image-counter');
  const status = document.getElementById('image-status');
  const retry = document.getElementById('image-retry');
  const original = document.getElementById('image-original');
  const stage = document.getElementById('image-stage');
  const zoomIn = document.getElementById('image-zoom-in');
  const zoomOut = document.getElementById('image-zoom-out');
  const scaleLabel = document.getElementById('image-scale');
  const reset = document.getElementById('image-reset');
  const feedback = document.getElementById('image-feedback');
  const stateTitle = document.getElementById('image-state-title');
  const thumbnails = document.getElementById('image-thumbnails');
  let loadingTimer;
  let feedbackTimer;
  let requestId = 0;
  let pendingImage;
  const pointers = new Map();
  let scale = 1;
  let offsetX = 0;
  let offsetY = 0;
  let gesture = null;
  const applyZoom = () => {
    if (!stage || !preview) return;
    const limitX = Math.max(0, (preview.clientWidth * scale - stage.clientWidth) / 2);
    const limitY = Math.max(0, (preview.clientHeight * scale - stage.clientHeight) / 2);
    offsetX = Math.max(-limitX, Math.min(limitX, offsetX));
    offsetY = Math.max(-limitY, Math.min(limitY, offsetY));
    preview.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    stage.dataset.zoomed = String(scale > 1);
    if (scaleLabel) scaleLabel.value = `${scale.toFixed(1)}×`;
    const ready = dialog?.dataset.imageState === 'ready';
    if (zoomIn) zoomIn.disabled = !ready || scale >= 8;
    if (zoomOut) zoomOut.disabled = !ready || scale <= 1;
    if (reset) reset.disabled = !ready || scale === 1;
  };
  const setScale = value => {
    if (dialog?.dataset.imageState !== 'ready') return;
    scale = Math.max(1, Math.min(8, value));
    applyZoom();
  };
  const resetZoom = () => {
    scale = 1;
    offsetX = offsetY = 0;
    pointers.clear();
    gesture = null;
    if (stage) stage.dataset.dragging = 'false';
    applyZoom();
  };
  let images = [];
  let index = 0;
  let thumbnailButtons = [];
  const setThumbnail = (button, src) => {
    if (!button || !src || button.querySelector('img')) return;
    const thumbnail = document.createElement('img');
    thumbnail.alt = '';
    thumbnail.decoding = 'async';
    thumbnail.addEventListener('error', () => thumbnail.remove(), { once: true });
    thumbnail.src = src;
    button.append(thumbnail);
  };
  const buildThumbnails = gallery => {
    if (!thumbnails) return;
    const enabled = gallery?.matches('[data-gallery]') && images.length > 1;
    thumbnailButtons = enabled ? images.map((image, position) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.imageIndex = String(position);
      button.textContent = String(position + 1);
      const label = t("查看第 {0} 张照片", position + 1);
      button.setAttribute('aria-label', image.alt ? label + ' · ' + image.alt : label);
      if (image.complete && image.naturalWidth) setThumbnail(button, image.currentSrc || image.src);
      return button;
    }) : [];
    thumbnails.hidden = !enabled;
    thumbnails.replaceChildren(...thumbnailButtons);
  };
  const syncThumbnails = () => {
    const current = thumbnailButtons[index];
    if (!current) return;
    const focused = thumbnails.contains(document.activeElement);
    for (const button of thumbnailButtons) {
      button.tabIndex = button === current ? 0 : -1;
      if (button === current) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    }
    if (focused) current.focus({ preventScroll: true });
    thumbnails.scrollLeft = current.offsetLeft - (thumbnails.clientWidth - current.offsetWidth) / 2;
  };
  const setImageState = state => {
    if (!dialog || !preview) return;
    dialog.dataset.imageState = state;
    preview.hidden = state === 'error' || (state === 'loading' && !preview.getAttribute('src'));
    if (feedback) feedback.hidden = state !== 'error';
    if (retry) retry.hidden = state !== 'error';
    if (stateTitle) stateTitle.textContent = state === 'error' ? t("这张图片暂时无法显示") : t("正在加载图片");
    if (status) status.textContent = state === 'error' ? t("原图暂时无法访问，请重试或切换其他照片。") : state === 'loading' ? t("稍等片刻，美好正在抵达。") : '';
    applyZoom();
  };
  const sourceFor = image => {
    const link = image.closest('a');
    return link && image.closest('.photo-card, .essay-images') ? link.href : image.currentSrc || image.src;
  };
  const render = () => {
    const image = images[index];
    if (!image || !preview) return;
    clearTimeout(loadingTimer);
    clearTimeout(feedbackTimer);
    const currentRequest = ++requestId;
    if (pendingImage) pendingImage.onload = pendingImage.onerror = null;
    setImageState('loading');
    pointers.clear();
    gesture = null;
    const source = sourceFor(image);
    const fail = () => {
      if (currentRequest !== requestId || !dialog?.open) return;
      clearTimeout(loadingTimer);
      clearTimeout(feedbackTimer);
      setImageState('error');
      resetZoom();
    };
    const commit = () => {
      if (currentRequest !== requestId || !dialog?.open) return;
      clearTimeout(loadingTimer);
      clearTimeout(feedbackTimer);
      preview.src = source;
      preview.alt = image.alt || t("图片预览");
      setThumbnail(thumbnailButtons[index], source);
      setImageState('ready');
      resetZoom();
    };
    const loader = new Image();
    pendingImage = loader;
    loader.onload = () => {
      if (currentRequest !== requestId) return;
      if (typeof loader.decode === 'function') {
        loader.decode().then(commit, fail);
      } else commit();
    };
    loader.onerror = fail;
    loader.src = source;
    feedbackTimer = setTimeout(() => {
      if (currentRequest === requestId && dialog?.open && dialog.dataset.imageState === 'loading' && feedback) feedback.hidden = false;
    }, 150);
    loadingTimer = setTimeout(fail, 15000);
    if (caption) caption.textContent = image.closest('[data-caption]')?.dataset.caption || image.alt || '';
    if (counter) counter.textContent = `${index + 1} / ${images.length}`;
    if (previous) previous.disabled = index === 0;
    if (next) next.disabled = index === images.length - 1;
    if (original) original.href = sourceFor(image);
  };
  const moveTo = target => {
    if (!Number.isInteger(target) || target < 0 || target >= images.length || target === index) return;
    index = target;
    render();
    syncThumbnails();
  };
  const move = direction => moveTo(index + direction);
  thumbnails?.addEventListener('click', event => {
    const button = event.target.closest?.('button[data-image-index]');
    if (button) moveTo(Number(button.dataset.imageIndex));
  });
  if (thumbnails) document.addEventListener('load', event => {
    if (!dialog?.open || !thumbnailButtons.length || !(event.target instanceof HTMLImageElement)) return;
    const image = event.target;
    setThumbnail(thumbnailButtons[images.indexOf(image)], image.currentSrc || image.src);
  }, true);
  const openImage = image => {
    if (document.documentElement.dataset.printPreview === 'true') return;
    if (!dialog || !preview) return;
    const gallery = image.closest('[data-gallery], .article-body, .essay-images');
    images = gallery ? [...gallery.querySelectorAll('img')].filter(item => item.matches(selector) && (!item.closest('a') || item.closest('.photo-card, .essay-images') || item.closest('a').href === item.src)) : [image];
    index = images.indexOf(image);
    if (index < 0) { images = [image]; index = 0; }
    buildThumbnails(gallery);
    render();
    if (!dialog.open) dialog.showModal();
    syncThumbnails();
    applyZoom();
  };
  zoomIn?.addEventListener('click', () => setScale(scale + .5));
  zoomOut?.addEventListener('click', () => setScale(scale - .5));
  reset?.addEventListener('click', resetZoom);
  stage?.addEventListener('wheel', event => {
    if (!dialog?.open || preview?.hidden || !event.deltaY) return;
    event.preventDefault();
    setScale(scale * (event.deltaY < 0 ? 1.15 : 1 / 1.15));
  }, { passive: false });
  stage?.addEventListener('dblclick', event => {
    if (dialog?.dataset.imageState !== 'ready') return;
    event.preventDefault();
    if (scale > 1) resetZoom();
    else setScale(2);
  });
  const distance = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  stage?.addEventListener('pointerdown', event => {
    if (!dialog?.open || dialog.dataset.imageState !== 'ready' || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    stage.setPointerCapture?.(event.pointerId);
    if (pointers.size === 1) gesture = { x: event.clientX, y: event.clientY, offsetX, offsetY, scale, swipe: event.pointerType === 'touch' };
    else if (pointers.size === 2) gesture = { distance: distance() || 1, scale };
    stage.dataset.dragging = String(scale > 1);
  });
  stage?.addEventListener('pointermove', event => {
    if (!pointers.has(event.pointerId) || !gesture) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2 && gesture.distance) setScale(gesture.scale * distance() / gesture.distance);
    else if (pointers.size === 1 && gesture.x !== undefined && scale > 1) {
      offsetX = gesture.offsetX + event.clientX - gesture.x;
      offsetY = gesture.offsetY + event.clientY - gesture.y;
      applyZoom();
    }
  });
  const endPointer = event => {
    if (!pointers.has(event.pointerId)) return;
    const dx = event.clientX - (gesture?.x ?? event.clientX);
    const dy = event.clientY - (gesture?.y ?? event.clientY);
    const swipe = event.type === 'pointerup' && pointers.size === 1 && gesture?.swipe && gesture.scale === 1 && scale === 1 && Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5;
    pointers.delete(event.pointerId);
    stage.releasePointerCapture?.(event.pointerId);
    gesture = null;
    stage.dataset.dragging = 'false';
    if (swipe) move(dx < 0 ? 1 : -1);
  };
  stage?.addEventListener('pointerup', endPointer);
  stage?.addEventListener('pointercancel', endPointer);
  stage?.addEventListener('lostpointercapture', event => {
    pointers.delete(event.pointerId);
    gesture = null;
    stage.dataset.dragging = 'false';
  });
  window.addEventListener('resize', applyZoom);
  previous?.addEventListener('click', () => move(-1));
  next?.addEventListener('click', () => move(1));
  retry?.addEventListener('click', render);
  document.addEventListener('click', event => {
    if (!(event.target instanceof Element)) return;
    const image = event.target.matches(selector) ? event.target : event.target.closest('.photo-card, .essay-images a')?.querySelector('img');
    if (!image) return;
    const link = image.closest('a');
    if (link && !image.closest('.photo-card, .essay-images') && link.href !== image.src) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openImage(image);
  });
  const enhanceImages = () => {
    document.querySelectorAll('[data-image-fallback] img').forEach(image => {
      if (image.dataset.fallbackReady) return;
      image.dataset.fallbackReady = 'true';
      const update = failed => {
        const holder = image.closest('[data-image-fallback]');
        holder.classList.toggle('image-failed', failed);
        const placeholder = holder.querySelector('.image-placeholder');
        if (placeholder) placeholder.hidden = !failed;
      };
      image.addEventListener('error', () => update(true));
      image.addEventListener('load', () => update(false));
      if (image.complete && image.getAttribute('src')) update(image.naturalWidth === 0);
    });
    document.querySelectorAll(selector).forEach(image => {
      if (image.closest('a')) return;
      image.tabIndex = 0;
      image.setAttribute('role', 'button');
      image.setAttribute('aria-label', t("预览图片{0}", image.alt ? `：${image.alt}` : ''));
    });
  };
  enhanceImages();
  window.addEventListener('hexo-blog-decrypt', enhanceImages);
  document.addEventListener('keydown', event => {
    if (dialog?.open && !event.altKey && !event.ctrlKey && !event.metaKey && !event.target.matches?.('input, textarea, select, [contenteditable="true"]')) {
      if (['+', '=', '-', '0'].includes(event.key)) {
        event.preventDefault();
        if (event.key === '0') resetZoom();
        else setScale(scale + (event.key === '-' ? -.5 : .5));
        return;
      }
    }
    if (dialog?.open && (event.key === 'ArrowLeft' || event.key === 'ArrowRight') && !event.altKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      move(event.key === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.target.matches?.(selector) && !event.target.closest('a')) {
      event.preventDefault();
      openImage(event.target);
    }
  });
  document.getElementById('image-close')?.addEventListener('click', () => dialog?.close());
  dialog?.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
  dialog?.addEventListener('close', () => {
    ++requestId;
    clearTimeout(loadingTimer);
    clearTimeout(feedbackTimer);
    if (pendingImage) pendingImage.onload = pendingImage.onerror = null;
    pendingImage = null;
    buildThumbnails(null);
    resetZoom();
    preview?.removeAttribute('src');
  });
  document.querySelectorAll('audio').forEach(audio => audio.addEventListener('play', () => {
    document.querySelectorAll('audio').forEach(other => { if (audio !== other) other.pause(); });
  }));
})();

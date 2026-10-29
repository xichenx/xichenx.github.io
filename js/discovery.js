(() => {
  document.querySelectorAll('[data-moments]').forEach(card => {
    const items = [...card.querySelectorAll('.moment-item')];
    const controls = card.querySelector('[data-moment-controls]');
    if (!items.length || !controls) return;
    let current = 0;
    controls.hidden = false;
    const show = direction => {
      current = (current + direction + items.length) % items.length;
      items.forEach((item, index) => { item.hidden = index !== current; });
      card.querySelector('[data-moment-count]').textContent = `${current + 1} / ${items.length}`;
    };
    card.querySelector('[data-moment-prev]')?.addEventListener('click', () => show(-1));
    card.querySelector('[data-moment-next]')?.addEventListener('click', () => show(1));
  });
  document.querySelectorAll('[data-random]').forEach(card => {
    const pool = [...(card.querySelector('[data-random-pool]')?.content.querySelectorAll('a') || [])].map(item => ({
      href: new URL(item.getAttribute('href'), document.baseURI).href,
      title: item.dataset.title,
      summary: item.dataset.summary
    }));
    const link = card.querySelector('[data-random-link]');
    const button = card.querySelector('[data-random-refresh]');
    if (!link || pool.length < 2 || !button) return;
    button.hidden = false;
    let remaining = [];
    button.addEventListener('click', () => {
      if (!remaining.length) remaining = pool.filter(item => item.href !== link.href);
      const index = Math.floor(Math.random() * remaining.length);
      const [selected] = remaining.splice(index, 1);
      link.href = selected.href;
      card.querySelector('[data-random-title]').textContent = selected.title;
      card.querySelector('[data-random-summary]').textContent = selected.summary;
      card.querySelector('[data-random-status]').textContent = `为你找到：${selected.title}`;
    });
  });
})();

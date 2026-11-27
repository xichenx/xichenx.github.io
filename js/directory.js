(() => {
  const t = (...args) => window.MoriiI18n ? window.MoriiI18n.t(...args) : args[0].replace(/\{(\d+)\}/g, (_, i) => String(args[Number(i) + 1] ?? ''));
  const directory = document.querySelector('.friend-directory');
  const input = document.getElementById('friend-search');
  const sections = [...document.querySelectorAll('[data-friend-section]')];
  const filters = [...document.querySelectorAll('[data-friend-group]')];
  const random = document.getElementById('friend-random');
  let activeGroup = 'all';
  let previousVisit;
  const filterFriends = () => {
    if (!directory || !input) return;
    const words = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    sections.forEach(section => {
      let sectionCount = 0;
      section.querySelectorAll('[data-friend-search]').forEach(card => {
        const match = (activeGroup === 'all' || section.dataset.friendSection === activeGroup) && words.every(word => card.dataset.friendSearch.includes(word));
        card.hidden = !match;
        if (match) sectionCount += 1;
      });
      section.hidden = sectionCount === 0;
      count += sectionCount;
    });
    document.getElementById('friend-search-status').textContent = t("找到 {0} 个链接", count);
    document.getElementById('friend-empty').hidden = count > 0;
    if (random) random.disabled = count === 0;
    const clear = document.getElementById('friend-clear');
    if (clear) clear.hidden = !input.value;
    sections.forEach(section => {
      const label = section.querySelector('.friend-group-count');
      if (label) label.textContent = String(section.querySelectorAll('[data-friend-search]:not([hidden])').length);
    });
    filters.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.friendGroup === activeGroup)));
  };
  filters.forEach(button => button.addEventListener('click', () => { activeGroup = button.dataset.friendGroup; filterFriends(); }));
  input?.addEventListener('input', filterFriends);
  document.getElementById('friend-clear')?.addEventListener('click', () => {
    input.value = '';
    filterFriends();
    input.focus();
  });
  document.getElementById('friend-reset')?.addEventListener('click', () => {
    activeGroup = 'all';
    input.value = '';
    filterFriends();
    input.focus();
  });
  if (directory && random) {
    random.hidden = false;
    random.addEventListener('click', () => {
      const links = directory.querySelectorAll('[data-friend-section]:not([hidden]) a[data-friend-search]:not([hidden])');
      const unique = [...new Map([...links].map(link => [link.href, link])).values()];
      const alternatives = unique.filter(link => link.href !== previousVisit);
      const choices = alternatives.length ? alternatives : unique;
      if (!choices.length) return;
      const link = choices[Math.floor(Math.random() * choices.length)];
      previousVisit = link.href;
      link.click();
    });
  }
  const copy = document.getElementById('copy-site-card');
  copy?.addEventListener('click', async () => {
    const field = document.getElementById('site-link-data');
    const status = document.getElementById('site-card-status');
    copy.disabled = true;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(field.value);
      status.textContent = t("本站信息已复制，可以粘贴到你的友链中。");
    } catch {
      const details = field.closest('details');
      if (details) details.open = true;
      field.focus();
      field.select();
      status.textContent = t("请复制上方已选中的本站信息。");
    } finally { copy.disabled = false; }
  });
})();

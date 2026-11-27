(() => {
  const toolbar = document.querySelector('[data-moment-filter]');
  if (!toolbar) return;
  const select = toolbar.querySelector('select');
  const status = toolbar.querySelector('[role="status"]');
  const groups = [...document.querySelectorAll('[data-moment-group]')].map(element => ({
    element, cards: [...element.querySelectorAll('[data-moment-month]')]
  }));
  const monthOf = card => card.dataset.momentMonth || 'undated';
  const values = new Set(groups.flatMap(group => group.cards.map(monthOf)));
  if (values.size < 2) return;

  const formatter = new Intl.DateTimeFormat(document.documentElement.lang || 'zh-CN', { year: 'numeric', month: 'long', timeZone: 'UTC' });
  const addOption = (value, label) => select.add(new Option(label, value));
  for (const month of [...values].filter(value => value !== 'undated').sort().reverse()) {
    addOption(month, formatter.format(new Date(month + '-01T00:00:00Z')));
  }
  if (values.has('undated')) addOption('undated', toolbar.dataset.undatedLabel);

  const apply = () => {
    let count = 0;
    for (const { element, cards } of groups) {
      let visible = 0;
      for (const card of cards) {
        card.hidden = Boolean(select.value) && monthOf(card) !== select.value;
        if (!card.hidden) visible++;
      }
      element.hidden = !visible;
      count += visible;
    }
    status.textContent = toolbar.dataset.countLabel.replace('{0}', String(count));
  };
  const revealLinkedMoment = () => {
    const id = location.hash.slice(1);
    if (!/^moment-\d+-\d+$/.test(id)) return;
    const card = document.getElementById(id);
    if (!card?.hidden || !card.matches('[data-moment-month]')) return;
    select.value = monthOf(card);
    apply();
    card.scrollIntoView({ block: 'start', behavior: 'instant' });
  };
  select.addEventListener('change', apply);
  window.addEventListener('hashchange', revealLinkedMoment);
  apply();
  revealLinkedMoment();
  toolbar.hidden = false;
})();

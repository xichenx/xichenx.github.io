(() => {
  const select = document.querySelector('[data-tag-order]');
  const list = document.querySelector('[data-tag-list]');
  if (!select || !list) return;

  const byCount = [...list.children];
  const byName = [...byCount].sort((a, b) => Number(a.dataset.tagNameOrder) - Number(b.dataset.tagNameOrder));
  let currentOrder = 'count';
  const applyOrder = () => {
    const requestedOrder = select.value;
    if (requestedOrder === currentOrder) return;
    const entries = requestedOrder === 'name' ? byName : byCount;
    const items = document.createDocumentFragment();
    entries.forEach(entry => items.append(entry));
    list.append(items);
    currentOrder = requestedOrder;
  };
  select.addEventListener('change', applyOrder);
  window.addEventListener('pageshow', applyOrder);
  select.closest('.tag-order').hidden = false;
  applyOrder();
})();

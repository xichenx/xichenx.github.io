/* Shared n-gram index rules: generator, worker and browser fallback use identical terms. */
(function (root, factory) {
  const engine = factory();
  if (typeof module === 'object' && module.exports) module.exports = engine;
  else root.MoriiSearchEngine = engine;
})(typeof globalThis === 'undefined' ? self : globalThis, function () {
  const grams = text => {
    const result = new Set();
    for (const word of String(text).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) {
      const chars = [...word];
      for (let size = 1; size <= 3; size++) for (let index = 0; index + size <= chars.length; index++) result.add(chars.slice(index, index + size).join(''));
    }
    return [...result];
  };
  const queryTerms = words => [...new Set(words.flatMap(word => {
    const result = [];
    for (const token of String(word).toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) {
      const chars = [...token], size = Math.min(3, chars.length);
      for (let index = 0; index + size <= chars.length; index++) result.push(chars.slice(index, index + size).join(''));
    }
    return result;
  }))];
  const bucketFor = (term, count = 64) => {
    let hash = 2166136261;
    for (let index = 0; index < term.length; index++) hash = Math.imul(hash ^ term.charCodeAt(index), 16777619);
    return (hash >>> 0) % count;
  };
  const candidates = ({ terms, postings }) => {
    const lists = terms.map(term => Object.hasOwn(postings, term) && Array.isArray(postings[term]) ? postings[term] : []).sort((a, b) => a.length - b.length);
    if (!lists.length) return [];
    let result = lists[0];
    for (const list of lists.slice(1)) { const members = new Set(list); result = result.filter(id => members.has(id)); if (!result.length) break; }
    return result;
  };
  const rank = ({ entries, words, query, scope, category }) => {
    const phrase = String(query || '').trim().toLowerCase();
    return entries.flatMap((entry, index) => {
      if (category && !entry.categories?.includes(category)) return [];
      const title = String(entry.title || '').toLowerCase(), topics = String(entry.protected ? '' : entry.topics || '').toLowerCase();
      const content = String(entry.protected ? '' : entry.content || entry.summary || '').toLowerCase();
      const haystack = scope === 'title' ? title : scope === 'topics' ? topics : `${title} ${content} ${topics}`;
      if (!words.every(word => haystack.includes(word))) return [];
      const score = (phrase && title === phrase ? 20 : phrase && title.includes(phrase) ? 10 : 0) + words.reduce((sum, word) => sum + (title.includes(word) ? 3 : topics.includes(word) ? 1 : 0), 0);
      return [{ index, score }];
    }).sort((a, b) => b.score - a.score || a.index - b.index);
  };
  return { grams, queryTerms, bucketFor, candidates, rank };
});

let engine;
let entries = [];
self.onmessage = event => {
  const { id, method, payload } = event.data || {};
  try {
    if (method === 'init') {
      const url = new URL(payload.engine, self.location.href);
      if (url.origin !== self.location.origin || !/^https?:$/.test(url.protocol)) throw new Error('Invalid worker engine');
      importScripts(url.href); engine = self.MoriiSearchEngine;
      if (!engine) throw new Error('Engine unavailable');
      self.postMessage({ id, result: true }); return;
    }
    if (method === 'entries' && engine && Array.isArray(payload.entries)) { entries = payload.entries; self.postMessage({ id, result: true }); return; }
    if (!engine || !['rank', 'candidates'].includes(method)) throw new Error('Unknown operation');
    self.postMessage({ id, result: engine[method](method === 'rank' ? { ...payload, entries: payload.entries || entries } : payload) });
  } catch { self.postMessage({ id, error: 'Search worker failed' }); }
};

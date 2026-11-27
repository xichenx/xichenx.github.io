/* Shared, dependency-free locale rules for Hexo and the browser. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.MoriiI18n = api.create(document.documentElement.lang, root.MoriiLocaleMessages || {});
  }
})(typeof window === 'undefined' ? globalThis : window, function () {
  const locale = value => {
    const code = String(Array.isArray(value) ? value[0] || '' : value || '').replace(/_/g, '-').toLowerCase();
    if (code === 'en' || code.startsWith('en-')) return 'en';
    if (['zh-tw', 'zh-hk', 'zh-hant'].includes(code) || code.startsWith('zh-hant-')) return 'zh-TW';
    return 'zh-CN';
  };
  const create = (language, messages = {}) => {
    const lang = locale(language);
    const t = (key, ...values) => {
      const text = Object.prototype.hasOwnProperty.call(messages, key) ? messages[key] : key;
      return String(text).replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index]) : match);
    };
    const localized = value => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
      return value[lang] ?? value['zh-CN'] ?? value.en ?? value['zh-TW'] ?? '';
    };
    return { locale: lang, t, localized };
  };
  return { locale, create };
});

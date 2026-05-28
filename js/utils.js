/* Shared utility functions used by multiple tab modules.
   Registered on window so other files can read them without a bundler. */

window.AppUtils = (function() {

  // Splits multi-value cells like "a, b; c" into a clean array.
  const splitMulti = (s) => {
    if (!s || typeof s !== 'string') return [];
    return s.split(/[,;]/).map(x => x.trim()).filter(Boolean);
  };

  // Collects the distinct values for a column across an array of records.
  const uniqueValues = (rows, key, multi = false) => {
    const set = new Set();
    rows.forEach(r => {
      const v = r[key];
      if (!v) return;
      if (multi) splitMulti(v).forEach(x => set.add(x));
      else set.add(typeof v === 'string' ? v.trim() : v);
    });
    return [...set].sort((a, b) => String(a).localeCompare(String(b)));
  };

  // Counts records grouped by a column, returned as [[value, count], ...] sorted descending by count.
  const countBy = (rows, key, multi = false) => {
    const counts = {};
    rows.forEach(r => {
      const v = r[key];
      if (!v) return;
      const items = multi ? splitMulti(v) : [typeof v === 'string' ? v.trim() : v];
      items.forEach(x => { counts[x] = (counts[x] || 0) + 1; });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  // Looks up a category record by its short code (LV, HVAC, etc.) from categories.json.
  const categoryByCode = (categories, code) => {
    if (!categories || !code) return null;
    return categories.find(c => c.code === code) || null;
  };

  // Returns black or white text depending on which gives better contrast against the given background.
  // Uses the standard perceptual luminance formula (Rec. 601).
  const pickContrastingTextColor = (hex) => {
    if (!hex || typeof hex !== 'string') return '#000000';
    const h = hex.trim().replace(/^#/, '');
    if (h.length !== 6) return '#000000';
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some(v => Number.isNaN(v))) return '#000000';
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55 ? '#0f172a' : '#ffffff';
  };

  // Formats a large integer with thousands separators for stat cards.
  const formatNumber = (n) => {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    return Number(n).toLocaleString('en-US');
  };

  // Compact formatter for very large numbers: 216,819,932 -> "216.8M".
  // Numbers below 1,000 are returned exactly; everything else picks the
  // largest unit (K/M/B) and keeps one decimal place, trimming trailing .0.
  const formatCompact = (n) => {
    if (n === null || n === undefined || Number.isNaN(n)) return '—';
    const num = Number(n);
    const abs = Math.abs(num);
    if (abs >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (abs >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e4) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return formatNumber(num);
  };

  return {
    splitMulti,
    uniqueValues,
    countBy,
    categoryByCode,
    pickContrastingTextColor,
    formatNumber,
    formatCompact,
  };
})();

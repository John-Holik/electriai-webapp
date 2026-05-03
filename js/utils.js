/* =========================================================
   Shared utility functions used by multiple components.
   Registered on window so other files can read them without
   a bundler.
   ========================================================= */

window.AppUtils = (function() {
  const splitMulti = (s) => {
    if (!s || typeof s !== 'string') return [];
    return s.split(/[,;]/).map(x => x.trim()).filter(Boolean);
  };

  const uniqueValues = (rows, key, multi = false) => {
    const set = new Set();
    rows.forEach(r => {
      const v = r[key];
      if (!v) return;
      if (multi) splitMulti(v).forEach(x => set.add(x));
      else set.add(v.trim());
    });
    return [...set].sort((a, b) => a.localeCompare(b));
  };

  const countBy = (rows, key, multi = false) => {
    const counts = {};
    rows.forEach(r => {
      const v = r[key];
      if (!v) return;
      const items = multi ? splitMulti(v) : [v.trim()];
      items.forEach(x => { counts[x] = (counts[x] || 0) + 1; });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  return { splitMulti, uniqueValues, countBy };
})();
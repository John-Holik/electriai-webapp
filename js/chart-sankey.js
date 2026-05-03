/* =========================================================
   Sankey diagram: AI Model -> Methodology -> Goal.
   Interactive: hover highlights connected flows (two-hop
   tracing from AI Models to Goals), click drills down to
   the underlying papers via the ID column.
   ========================================================= */

window.AppCharts = window.AppCharts || {};

(function() {
  const { useState, useMemo } = React;

  const SankeyChart = ({ sankeyRows, papersData, onPaperClick }) => {
    const [hover, setHover] = useState(null);
    const [selected, setSelected] = useState(null);
    const [minFlow, setMinFlow] = useState(1);

    const cleanLabel = (s) => {
      if (!s) return '';
      return String(s).replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
    };

    const colorMap = useMemo(() => {
      const palette = [
        '#1d4ed8', '#10b981', '#06b6d4', '#eab308', '#ec4899',
        '#8b5cf6', '#f97316', '#0891b2', '#dc2626', '#65a30d',
        '#0ea5e9', '#7c3aed', '#059669', '#d97706', '#be185d',
      ];
      const map = {};
      let idx = 0;
      const cleaned = (sankeyRows || []).map(r => ({
        ai: cleanLabel(r['AI Model']),
        m: cleanLabel(r['Methodology']),
        g: cleanLabel(r['Goal']),
      })).filter(r => r.ai && r.m && r.g);
      [...new Set(cleaned.map(r => r.ai))].forEach(l => {
        if (!(l in map)) { map[l] = palette[idx % palette.length]; idx++; }
      });
      [...new Set(cleaned.map(r => r.m))].forEach(l => {
        if (!(l in map)) { map[l] = palette[idx % palette.length]; idx++; }
      });
      [...new Set(cleaned.map(r => r.g))].forEach(l => {
        if (!(l in map)) { map[l] = '#475569'; }
      });
      return map;
    }, [sankeyRows]);

    const maxOverallFlow = useMemo(() => {
      if (!sankeyRows || sankeyRows.length === 0) return 1;
      const counts = new Map();
      sankeyRows.forEach(r => {
        const ai = cleanLabel(r['AI Model']);
        const m = cleanLabel(r['Methodology']);
        const g = cleanLabel(r['Goal']);
        if (!ai || !m || !g) return;
        const k1 = `${ai}|||${m}`;
        counts.set(k1, (counts.get(k1) || 0) + 1);
        const k2 = `${m}|||${g}`;
        counts.set(k2, (counts.get(k2) || 0) + 1);
      });
      return Math.max(1, ...counts.values());
    }, [sankeyRows]);

    const layout = useMemo(() => {
      if (!sankeyRows || sankeyRows.length === 0) return null;

      const cleaned = sankeyRows.map(r => ({
        id: String(r.ID || r.id || ''),
        ai: cleanLabel(r['AI Model']),
        m: cleanLabel(r['Methodology']),
        g: cleanLabel(r['Goal']),
        aiFull: (r['AI Model'] || '').trim(),
        mFull: (r['Methodology'] || '').trim(),
        gFull: (r['Goal'] || '').trim(),
      })).filter(r => r.ai && r.m && r.g && r.id);

      if (cleaned.length === 0) return { empty: true, totalRows: 0 };

      const fullLabels = {};
      const links1Map = new Map();
      const links2Map = new Map();
      cleaned.forEach(r => {
        fullLabels[r.ai] = r.aiFull || r.ai;
        fullLabels[r.m] = r.mFull || r.m;
        fullLabels[r.g] = r.gFull || r.g;
        const k1 = `${r.ai}|||${r.m}`;
        if (!links1Map.has(k1)) links1Map.set(k1, { src: r.ai, tgt: r.m, srcCol: 0, tgtCol: 1, value: 0, ids: new Set() });
        const l1 = links1Map.get(k1);
        l1.value++; l1.ids.add(r.id);
        const k2 = `${r.m}|||${r.g}`;
        if (!links2Map.has(k2)) links2Map.set(k2, { src: r.m, tgt: r.g, srcCol: 1, tgtCol: 2, value: 0, ids: new Set() });
        const l2 = links2Map.get(k2);
        l2.value++; l2.ids.add(r.id);
      });
      [...links1Map.values(), ...links2Map.values()].forEach(l => { l.ids = [...l.ids]; });

      const links1 = [...links1Map.values()].filter(l => l.value >= minFlow);
      const links2 = [...links2Map.values()].filter(l => l.value >= minFlow);

      const aiSet = new Set(links1.map(l => l.src));
      const mSet = new Set([...links1.map(l => l.tgt), ...links2.map(l => l.src)]);
      const gSet = new Set(links2.map(l => l.tgt));

      if (aiSet.size === 0 || mSet.size === 0 || gSet.size === 0) {
        return { empty: true, totalRows: cleaned.length };
      }

      const nodeFlow = {};
      aiSet.forEach(ai => {
        nodeFlow[ai] = links1.filter(l => l.src === ai).reduce((s, l) => s + l.value, 0);
      });
      mSet.forEach(m => {
        const inF = links1.filter(l => l.tgt === m).reduce((s, l) => s + l.value, 0);
        const outF = links2.filter(l => l.src === m).reduce((s, l) => s + l.value, 0);
        nodeFlow[m] = Math.max(inF, outF, 1);
      });
      gSet.forEach(g => {
        nodeFlow[g] = links2.filter(l => l.tgt === g).reduce((s, l) => s + l.value, 0);
      });

      const aiList = [...aiSet].sort((a, b) => nodeFlow[b] - nodeFlow[a]);
      const mList = [...mSet].sort((a, b) => nodeFlow[b] - nodeFlow[a]);
      const gList = [...gSet].sort((a, b) => nodeFlow[b] - nodeFlow[a]);

      const width = 1000;
      const padTop = 30;
      const padBottom = 24;
      const labelMargin = 220;
      const nodeWidth = 14;
      const colX = [
        labelMargin,
        width / 2 - nodeWidth / 2,
        width - labelMargin - nodeWidth,
      ];
      const nodePadding = 14;

      const colTotals = [aiList, mList, gList].map(list => list.reduce((s, n) => s + nodeFlow[n], 0));
      const colPaddings = [aiList, mList, gList].map(list => Math.max(0, list.length - 1) * nodePadding);
      const desiredHeight = 560;
      const maxColTotal = Math.max(...colTotals);
      const maxColPadding = Math.max(...colPaddings);
      const availHeight = desiredHeight - maxColPadding - padTop - padBottom;
      const scale = availHeight / maxColTotal;

      const nodeMap = new Map();
      [
        { list: aiList, x: colX[0], col: 0 },
        { list: mList, x: colX[1], col: 1 },
        { list: gList, x: colX[2], col: 2 },
      ].forEach(({ list, x, col }) => {
        const colFlow = list.reduce((s, n) => s + nodeFlow[n], 0);
        const colPad = Math.max(0, list.length - 1) * nodePadding;
        const colHeight = colFlow * scale + colPad;
        let y = padTop + (desiredHeight - padTop - padBottom - colHeight) / 2;
        list.forEach(label => {
          const h = nodeFlow[label] * scale;
          const ids = new Set();
          if (col === 0) {
            links1.filter(l => l.src === label).forEach(l => l.ids.forEach(id => ids.add(id)));
          } else if (col === 1) {
            links1.filter(l => l.tgt === label).forEach(l => l.ids.forEach(id => ids.add(id)));
            links2.filter(l => l.src === label).forEach(l => l.ids.forEach(id => ids.add(id)));
          } else {
            links2.filter(l => l.tgt === label).forEach(l => l.ids.forEach(id => ids.add(id)));
          }
          nodeMap.set(label, {
            label,
            fullLabel: fullLabels[label] || label,
            col, x, y,
            width: nodeWidth, height: h,
            flow: nodeFlow[label],
            ids: [...ids],
          });
          y += h + nodePadding;
        });
      });

      const allLinks = [...links1, ...links2];
      const outgoing = {};
      const incoming = {};
      allLinks.forEach(l => {
        (outgoing[l.src] = outgoing[l.src] || []).push(l);
        (incoming[l.tgt] = incoming[l.tgt] || []).push(l);
      });
      Object.keys(outgoing).forEach(src => {
        const srcN = nodeMap.get(src);
        if (!srcN) return;
        const sorted = [...outgoing[src]].sort((a, b) => {
          const aT = nodeMap.get(a.tgt);
          const bT = nodeMap.get(b.tgt);
          return (aT?.y ?? 0) - (bT?.y ?? 0);
        });
        let y = srcN.y;
        sorted.forEach(l => {
          const h = l.value * scale;
          l.sy0 = y;
          l.sy1 = y + h;
          y += h;
        });
      });
      Object.keys(incoming).forEach(tgt => {
        const tgtN = nodeMap.get(tgt);
        if (!tgtN) return;
        const sorted = [...incoming[tgt]].sort((a, b) => {
          const aS = nodeMap.get(a.src);
          const bS = nodeMap.get(b.src);
          return (aS?.y ?? 0) - (bS?.y ?? 0);
        });
        let y = tgtN.y;
        sorted.forEach(l => {
          const h = l.value * scale;
          l.ty0 = y;
          l.ty1 = y + h;
          y += h;
        });
      });

      return {
        empty: false,
        nodes: [...nodeMap.values()],
        links: allLinks,
        width, height: desiredHeight,
        nodeMap,
        totalPapers: cleaned.length,
        maxValue: Math.max(...allLinks.map(l => l.value), 1),
        colCount: [aiList.length, mList.length, gList.length],
        colCenters: [colX[0] + nodeWidth / 2, colX[1] + nodeWidth / 2, colX[2] + nodeWidth / 2],
      };
    }, [sankeyRows, minFlow]);

    const focusedLinks = useMemo(() => {
      const focus = selected || hover;
      if (!focus || !layout || layout.empty) return null;
      const set = new Set();
      if (focus.type === 'link') {
        set.add(focus.link);
        return set;
      }
      if (focus.type === 'node') {
        const lbl = focus.label;
        const focusN = layout.nodeMap.get(lbl);
        if (!focusN) return new Set();
        layout.links.forEach(l => {
          if (l.src === lbl || l.tgt === lbl) set.add(l);
        });
        if (focusN.col === 0) {
          const reachM = new Set(layout.links.filter(l => l.src === lbl).map(l => l.tgt));
          layout.links.forEach(l => { if (reachM.has(l.src)) set.add(l); });
        }
        if (focusN.col === 2) {
          const reachM = new Set(layout.links.filter(l => l.tgt === lbl).map(l => l.src));
          layout.links.forEach(l => { if (reachM.has(l.tgt)) set.add(l); });
        }
        return set;
      }
      return null;
    }, [selected, hover, layout]);

    const focusedNodeLabels = useMemo(() => {
      if (!focusedLinks) return null;
      const set = new Set();
      focusedLinks.forEach(l => { set.add(l.src); set.add(l.tgt); });
      return set;
    }, [focusedLinks]);

    const drillIds = useMemo(() => {
      if (!selected || !layout || layout.empty) return null;
      if (selected.type === 'node') {
        const n = layout.nodeMap.get(selected.label);
        return n ? n.ids : [];
      }
      if (selected.type === 'link') return selected.link.ids;
      return null;
    }, [selected, layout]);

    const drillPapers = useMemo(() => {
      if (!drillIds) return [];
      const ids = new Set(drillIds.map(String));
      return papersData.filter(p => ids.has(String(p.ID)));
    }, [drillIds, papersData]);

    if (!sankeyRows || sankeyRows.length === 0) {
      return (
        <div className="text-sm text-slate-500 italic">
          Sankey data not available. Add sankey_diagram.csv next to index.html and reload.
        </div>
      );
    }
    if (!layout) return <div className="text-sm text-slate-500">Loading…</div>;
    if (layout.empty) {
      return (
        <div className="text-center py-6 text-sm text-slate-500">
          No flows match the current minimum-flow filter.
          <button onClick={() => setMinFlow(1)} className="ml-2 underline text-slate-700">Reset</button>
        </div>
      );
    }

    const ribbonPath = (l) => {
      const srcN = layout.nodeMap.get(l.src);
      const tgtN = layout.nodeMap.get(l.tgt);
      if (!srcN || !tgtN) return '';
      const x0 = srcN.x + srcN.width;
      const x1 = tgtN.x;
      const xMid = (x0 + x1) / 2;
      return `M ${x0} ${l.sy0} C ${xMid} ${l.sy0}, ${xMid} ${l.ty0}, ${x1} ${l.ty0} L ${x1} ${l.ty1} C ${xMid} ${l.ty1}, ${xMid} ${l.sy1}, ${x0} ${l.sy1} Z`;
    };

    const truncate = (s, max) => (s && s.length > max ? s.slice(0, max - 1) + '…' : (s || ''));
    const linkColor = (l) => colorMap[l.src] || '#94a3b8';

    const focusActive = !!(selected || hover);

    return (
      <div className="space-y-5">
        <div className="space-y-3 pb-4 border-b border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                Minimum flow size
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max={maxOverallFlow}
                  value={minFlow}
                  onChange={(e) => { setMinFlow(parseInt(e.target.value)); setSelected(null); }}
                  className="flex-1 accent-slate-900"
                />
                <span className="text-xs font-medium text-slate-700 tabular-nums w-10 text-right">
                  ≥ {minFlow}
                </span>
              </div>
            </div>
            {(selected || minFlow > 1) && (
              <div className="flex justify-end">
                <button
                  onClick={() => { setSelected(null); setMinFlow(1); }}
                  className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                >
                  Reset filters and selection
                </button>
              </div>
            )}
          </div>
          <div className="text-[11px] text-slate-500 leading-relaxed">
            <span className="font-semibold text-slate-700">{layout.colCount[0]}</span> AI techniques flow through{' '}
            <span className="font-semibold text-slate-700">{layout.colCount[1]}</span> methodological groupings into{' '}
            <span className="font-semibold text-slate-700">{layout.colCount[2]}</span> overarching themes,
            covering <span className="font-semibold text-slate-700">{layout.totalPapers}</span> reviewed papers.
            <span className="text-slate-400"> Hover any node or ribbon to highlight its connections; click to drill down to the underlying papers.</span>
          </div>
        </div>

        <div className="overflow-x-auto scrollbar-thin">
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            style={{ width: '100%', minWidth: '720px' }}
            preserveAspectRatio="xMidYMid meet"
            onMouseLeave={() => setHover(null)}
          >
            {[
              { label: 'AI TECHNIQUE', x: layout.colCenters[0] },
              { label: 'METHODOLOGICAL GROUPING', x: layout.colCenters[1] },
              { label: 'OVERARCHING THEME', x: layout.colCenters[2] },
            ].map(h => (
              <text key={h.label}
                x={h.x} y={14}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill="#64748b"
                letterSpacing="0.05em"
              >
                {h.label}
              </text>
            ))}

            {layout.links.map((l, i) => {
              const focused = focusActive ? (focusedLinks && focusedLinks.has(l)) : null;
              const opacity = !focusActive ? 0.45 : (focused ? 0.78 : 0.07);
              const isSelected = selected && selected.type === 'link' && selected.link === l;
              return (
                <path
                  key={`link-${i}`}
                  d={ribbonPath(l)}
                  fill={linkColor(l)}
                  fillOpacity={opacity}
                  stroke={isSelected ? '#0f172a' : 'none'}
                  strokeWidth={isSelected ? 1 : 0}
                  strokeOpacity={isSelected ? 0.6 : 0}
                  onMouseEnter={() => setHover({ type: 'link', link: l })}
                  onClick={() => setSelected(prev =>
                    (prev && prev.type === 'link' && prev.link === l) ? null : { type: 'link', link: l }
                  )}
                  style={{ cursor: 'pointer', transition: 'fill-opacity 150ms' }}
                >
                  <title>{`${l.src} → ${l.tgt}: ${l.value} paper${l.value > 1 ? 's' : ''}`}</title>
                </path>
              );
            })}

            {layout.nodes.map(n => {
              const focused = focusActive ? (focusedNodeLabels && focusedNodeLabels.has(n.label)) : null;
              const opacity = !focusActive ? 1 : (focused ? 1 : 0.25);
              const isSelected = selected && selected.type === 'node' && selected.label === n.label;
              return (
                <g
                  key={`node-${n.label}`}
                  onMouseEnter={() => setHover({ type: 'node', label: n.label })}
                  onClick={() => setSelected(prev =>
                    (prev && prev.type === 'node' && prev.label === n.label) ? null : { type: 'node', label: n.label }
                  )}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={n.x} y={n.y}
                    width={n.width} height={Math.max(n.height, 1)}
                    fill={colorMap[n.label] || '#475569'}
                    fillOpacity={opacity}
                    stroke={isSelected ? '#0f172a' : 'none'}
                    strokeWidth={isSelected ? 2 : 0}
                    style={{ transition: 'all 150ms' }}
                  />
                  <title>{`${n.fullLabel} (${n.flow} paper${n.flow > 1 ? 's' : ''})`}</title>
                </g>
              );
            })}

            {layout.nodes.map(n => {
              const focused = focusActive ? (focusedNodeLabels && focusedNodeLabels.has(n.label)) : null;
              const isFocused = focused === true;
              const isFaded = focused === false;
              const labelColor = isFaded ? '#cbd5e1' : '#1e293b';
              let x, anchor;
              if (n.col === 0) { x = n.x - 8; anchor = 'end'; }
              else { x = n.x + n.width + 8; anchor = 'start'; }
              const y = n.y + Math.max(n.height, 1) / 2 + 4;
              const maxChars = n.col === 1 ? 36 : 28;
              return (
                <g key={`label-${n.label}`} pointerEvents="none">
                  <text
                    x={x} y={y}
                    textAnchor={anchor}
                    fontSize="11"
                    fontWeight={isFocused ? '700' : '500'}
                    fill={labelColor}
                    style={{ transition: 'all 150ms' }}
                  >
                    {truncate(n.label, maxChars)}
                  </text>
                  {n.height > 22 && (
                    <text
                      x={x} y={y + 13}
                      textAnchor={anchor}
                      fontSize="9.5"
                      fill={isFaded ? '#e2e8f0' : '#64748b'}
                      style={{ transition: 'all 150ms' }}
                    >
                      {n.flow}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {selected && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 animate-fade">
            <div className="flex items-start justify-between mb-3 gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
                  {selected.type === 'link' ? 'Papers in this flow' : 'Papers connected to this node'}
                </div>
                <div className="text-sm text-slate-900 font-medium break-words">
                  {selected.type === 'link' ? (
                    <span>
                      {selected.link.src} <span className="text-slate-400">→</span> {selected.link.tgt}
                    </span>
                  ) : (
                    (layout.nodeMap.get(selected.label)?.fullLabel) || selected.label
                  )}
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  {drillPapers.length} unique paper{drillPapers.length !== 1 ? 's' : ''}
                </div>
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-slate-900 text-xl leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-slate-200 flex-shrink-0"
                aria-label="Close"
              >×</button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
              {drillPapers.length > 0 ? drillPapers.map((p, i) => (
                <button
                  key={i}
                  onClick={() => onPaperClick && onPaperClick(p)}
                  className="block w-full text-left p-2.5 bg-white border border-slate-200 rounded hover:border-slate-400 hover:shadow-sm transition-all"
                >
                  <div className="text-[11px] text-slate-500 mb-0.5">
                    {p.Author_Year || (p.Authors ? `${p.Authors.split(';')[0].split(',')[0]} (${p.Year})` : p.Year)}
                    <span className="text-slate-300"> · </span>
                    <span className="italic">{p.Journal}</span>
                  </div>
                  <div className="text-sm text-slate-900 leading-snug serif">{p.Title}</div>
                </button>
              )) : (
                <div className="text-xs text-slate-500 italic">
                  No papers matched. Confirm that the ID column in
                  <code className="px-1 bg-slate-200 rounded mx-1">data.csv</code>
                  aligns with
                  <code className="px-1 bg-slate-200 rounded mx-1">sankey_diagram.csv</code>.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  window.AppCharts.SankeyChart = SankeyChart;
})();
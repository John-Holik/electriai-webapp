/* =========================================================
   Heatmap: AI Model Categories x Area of Construction.
   Cell color saturation encodes frequency. Interactive:
   - Hover highlights row, column, and the corresponding labels
   - Click a cell to drill down to the papers in that pairing
   - Click a row or column header to drill down to the entire row/column
   - Toggle to include or exclude "No Specific AI Model / Review Studies"
   - Sort axes by frequency (default) or alphabetically
   ========================================================= */

window.AppCharts = window.AppCharts || {};

(function() {
  const { useState, useMemo } = React;

  const REVIEW_CATEGORY = 'No Specific AI Model / Review Studies';

  const HeatmapChart = ({ heatmapRows, papersData, onPaperClick }) => {
    const [hover, setHover] = useState(null);
    const [selected, setSelected] = useState(null);
    const [includeReview, setIncludeReview] = useState(false);
    const [sortBy, setSortBy] = useState('frequency');

    const cleanedRows = useMemo(() => {
      if (!heatmapRows) return [];
      return heatmapRows
        .map(r => ({
          id: String(r.ID || r.id || '').trim(),
          cat: (r['AI Model Categories'] || '').trim(),
          model: (r['AI Model'] || '').trim(),
          area: (r['Area of Construction'] || '').trim(),
        }))
        .filter(r => r.id && r.cat && r.area);
    }, [heatmapRows]);

    const totalRows = cleanedRows.length;

    // Counts before applying the review-toggle filter, so the toggle label
    // can show how many papers it would add or remove
    const reviewCount = useMemo(() =>
      cleanedRows.filter(r => r.cat === REVIEW_CATEGORY).length,
      [cleanedRows]
    );

    const activeRows = useMemo(() =>
      includeReview ? cleanedRows : cleanedRows.filter(r => r.cat !== REVIEW_CATEGORY),
      [cleanedRows, includeReview]
    );

    const layout = useMemo(() => {
      if (activeRows.length === 0) return null;

      // Build matrix: cell[cat][area] = { count, ids[] }
      const matrix = new Map();
      const catTotals = new Map();
      const areaTotals = new Map();

      activeRows.forEach(r => {
        const key = `${r.cat}|||${r.area}`;
        if (!matrix.has(key)) {
          matrix.set(key, { cat: r.cat, area: r.area, count: 0, ids: [], models: new Map() });
        }
        const cell = matrix.get(key);
        cell.count++;
        cell.ids.push(r.id);
        if (r.model) {
          cell.models.set(r.model, (cell.models.get(r.model) || 0) + 1);
        }
        catTotals.set(r.cat, (catTotals.get(r.cat) || 0) + 1);
        areaTotals.set(r.area, (areaTotals.get(r.area) || 0) + 1);
      });

      let cats = [...catTotals.keys()];
      let areas = [...areaTotals.keys()];

      if (sortBy === 'frequency') {
        cats.sort((a, b) => (catTotals.get(b) || 0) - (catTotals.get(a) || 0));
        areas.sort((a, b) => (areaTotals.get(b) || 0) - (areaTotals.get(a) || 0));
      } else {
        cats.sort((a, b) => a.localeCompare(b));
        areas.sort((a, b) => a.localeCompare(b));
      }

      const cells = [];
      cats.forEach((cat, ri) => {
        areas.forEach((area, ci) => {
          const key = `${cat}|||${area}`;
          const cell = matrix.get(key);
          if (cell) {
            cells.push({
              ...cell,
              ri, ci,
              topModels: [...cell.models.entries()]
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([m, n]) => ({ model: m, count: n })),
            });
          }
        });
      });

      const maxCount = cells.length > 0 ? Math.max(...cells.map(c => c.count)) : 1;

      return {
        cats, areas, cells, matrix,
        catTotals, areaTotals,
        maxCount,
        totalActiveRows: activeRows.length,
      };
    }, [activeRows, sortBy]);

    const drillIds = useMemo(() => {
      if (!selected || !layout) return null;
      if (selected.type === 'cell') {
        const cell = layout.matrix.get(`${selected.cat}|||${selected.area}`);
        return cell ? cell.ids : [];
      }
      if (selected.type === 'cat') {
        return activeRows.filter(r => r.cat === selected.label).map(r => r.id);
      }
      if (selected.type === 'area') {
        return activeRows.filter(r => r.area === selected.label).map(r => r.id);
      }
      return null;
    }, [selected, layout, activeRows]);

    const drillPapers = useMemo(() => {
      if (!drillIds) return [];
      const ids = new Set(drillIds.map(String));
      return papersData.filter(p => ids.has(String(p.ID)));
    }, [drillIds, papersData]);

    if (!heatmapRows || heatmapRows.length === 0) {
      return (
        <div className="text-sm text-slate-500 italic">
          Heatmap data not available. Add heat_map.csv next to index.html and reload.
        </div>
      );
    }
    if (!layout) {
      return (
        <div className="text-center py-6 text-sm text-slate-500">
          No data to display.
          <button onClick={() => setIncludeReview(true)} className="ml-2 underline text-slate-700">
            Include review studies
          </button>
        </div>
      );
    }

    // Geometry
    const cellW = 56;
    const cellH = 36;
    const padLeft = 230;
    const padTop = 28;
    const padBottom = 170;
    const padRight = 32;
    const colTotalH = 22;
    const rowTotalW = 36;
    const plotW = layout.areas.length * cellW;
    const plotH = layout.cats.length * cellH;
    const totalW = padLeft + plotW + rowTotalW + padRight;
    const totalH = padTop + plotH + colTotalH + padBottom;

    // Color scale: white to deep blue (matplotlib Blues)
    const cellColor = (count) => {
      if (count === 0) return '#ffffff';
      // Square root scaling to give small counts more visual weight
      const t = Math.sqrt(count) / Math.sqrt(layout.maxCount);
      // Interpolate from very light blue to deep blue
      const r = Math.round(247 + (8 - 247) * t);
      const g = Math.round(251 + (48 - 251) * t);
      const b = Math.round(255 + (107 - 255) * t);
      return `rgb(${r}, ${g}, ${b})`;
    };

    // Pick legible text color for each cell
    const textColor = (count) => {
      const t = Math.sqrt(count) / Math.sqrt(layout.maxCount);
      return t > 0.55 ? '#ffffff' : '#1e293b';
    };

    const truncate = (s, max) => (s && s.length > max ? s.slice(0, max - 1) + '…' : (s || ''));

    const focusedCat = hover?.cat || (selected?.type === 'cell' ? selected.cat : null) ||
                       (selected?.type === 'cat' ? selected.label : null);
    const focusedArea = hover?.area || (selected?.type === 'cell' ? selected.area : null) ||
                        (selected?.type === 'area' ? selected.label : null);

    const filtersActive = !includeReview === false || sortBy !== 'frequency' || selected;

    return (
      <div className="space-y-5">
        {/* Filter controls */}
        <div className="space-y-3 pb-4 border-b border-slate-100">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                Sort axes by
              </div>
              <div className="flex gap-1.5">
                {[
                  ['frequency', 'Frequency'],
                  ['alphabetical', 'A to Z'],
                ].map(([k, lbl]) => (
                  <button
                    key={k}
                    onClick={() => setSortBy(k)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                      sortBy === k
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                Review and conceptual studies
              </div>
              <button
                onClick={() => setIncludeReview(!includeReview)}
                title="Papers in the No Specific AI Model / Review Studies category do not implement a specific AI model. They are discussed separately in the manuscript."
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                  includeReview
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                }`}
              >
                {includeReview ? `Included (+${reviewCount})` : `Excluded (−${reviewCount})`}
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 leading-relaxed">
            Cross-tabulation of <span className="font-semibold text-slate-700">{layout.cats.length}</span> AI model categories
            against <span className="font-semibold text-slate-700">{layout.areas.length}</span> construction application areas,
            covering <span className="font-semibold text-slate-700">{layout.totalActiveRows}</span> reviewed papers
            {!includeReview && (
              <span className="text-slate-400"> ({reviewCount} review and conceptual papers excluded)</span>
            )}.
            <span className="text-slate-400"> Hover any cell or label to highlight; click a cell to drill down to the underlying papers, or click a row or column label to see all papers in that category or domain.</span>
          </div>
        </div>

        {/* SVG */}
        <div className="overflow-x-auto scrollbar-thin">
          <svg
            viewBox={`0 0 ${totalW} ${totalH}`}
            style={{ width: '100%', minWidth: Math.min(totalW, 720) + 'px' }}
            preserveAspectRatio="xMidYMid meet"
            onMouseLeave={() => setHover(null)}
          >
            {/* Y axis labels (categories), clickable */}
            {layout.cats.map((cat, ri) => {
              const isFocused = focusedCat === cat;
              const isSelected = selected?.type === 'cat' && selected.label === cat;
              const total = layout.catTotals.get(cat) || 0;
              return (
                <g key={`cat-${cat}`}
                  onMouseEnter={() => setHover({ cat, area: null })}
                  onClick={() => setSelected(prev =>
                    (prev?.type === 'cat' && prev.label === cat) ? null : { type: 'cat', label: cat }
                  )}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={0} y={padTop + ri * cellH}
                    width={padLeft - 6} height={cellH}
                    fill={isSelected ? '#0f172a' : 'transparent'}
                    fillOpacity={isSelected ? 0.06 : 0}
                  />
                  <text
                    x={padLeft - 10}
                    y={padTop + ri * cellH + cellH / 2 + 4}
                    textAnchor="end" fontSize="11"
                    fill={isFocused ? '#0f172a' : '#475569'}
                    fontWeight={isFocused ? '700' : '500'}
                    style={{ transition: 'all 150ms' }}
                  >
                    {truncate(cat, 32)}
                  </text>
                </g>
              );
            })}

            {/* Row totals on the right */}
            {layout.cats.map((cat, ri) => {
              const total = layout.catTotals.get(cat) || 0;
              const isFocused = focusedCat === cat;
              return (
                <text key={`rt-${cat}`}
                  x={padLeft + plotW + rowTotalW / 2}
                  y={padTop + ri * cellH + cellH / 2 + 4}
                  textAnchor="middle" fontSize="10"
                  fontWeight={isFocused ? '700' : '500'}
                  fill={isFocused ? '#0f172a' : '#94a3b8'}
                  style={{ transition: 'all 150ms' }}
                >
                  {total}
                </text>
              );
            })}

            {/* Cells */}
            {layout.cells.map((c, i) => {
              const x = padLeft + c.ci * cellW;
              const y = padTop + c.ri * cellH;
              const isHover = hover && hover.cat === c.cat && hover.area === c.area;
              const isSelected = selected?.type === 'cell' && selected.cat === c.cat && selected.area === c.area;
              return (
                <g key={`cell-${i}`}
                  onMouseEnter={() => setHover({ cat: c.cat, area: c.area })}
                  onClick={() => setSelected(prev =>
                    (prev?.type === 'cell' && prev.cat === c.cat && prev.area === c.area)
                      ? null
                      : { type: 'cell', cat: c.cat, area: c.area }
                  )}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={x} y={y} width={cellW} height={cellH}
                    fill={cellColor(c.count)}
                    stroke={isSelected ? '#0f172a' : (isHover ? '#0f172a' : '#e2e8f0')}
                    strokeWidth={isSelected ? 2 : (isHover ? 1.5 : 0.5)}
                    style={{ transition: 'stroke 150ms, stroke-width 150ms' }}
                  />
                  <text
                    x={x + cellW / 2} y={y + cellH / 2 + 4}
                    textAnchor="middle"
                    fontSize="11"
                    fontWeight="600"
                    fill={textColor(c.count)}
                    pointerEvents="none"
                  >
                    {c.count}
                  </text>
                  <title>
                    {`${c.cat}\n${c.area}\n${c.count} paper${c.count > 1 ? 's' : ''}${
                      c.topModels.length > 0
                        ? '\n\nTop models:\n' + c.topModels.map(m => `  ${m.model} (${m.count})`).join('\n')
                        : ''
                    }`}
                  </title>
                </g>
              );
            })}

            {/* X axis labels (areas, rotated) */}
            {layout.areas.map((area, ci) => {
              const x = padLeft + ci * cellW + cellW / 2;
              const y = padTop + plotH + colTotalH + 16;
              const isFocused = focusedArea === area;
              const isSelected = selected?.type === 'area' && selected.label === area;
              return (
                <g key={`area-${area}`}
                  onMouseEnter={() => setHover({ cat: null, area })}
                  onClick={() => setSelected(prev =>
                    (prev?.type === 'area' && prev.label === area) ? null : { type: 'area', label: area }
                  )}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={padLeft + ci * cellW} y={padTop + plotH + colTotalH}
                    width={cellW} height={padBottom - colTotalH - 8}
                    fill={isSelected ? '#0f172a' : 'transparent'}
                    fillOpacity={isSelected ? 0.04 : 0}
                  />
                  <text
                    x={x} y={y}
                    textAnchor="end" fontSize="11"
                    fill={isFocused ? '#0f172a' : '#475569'}
                    fontWeight={isFocused ? '700' : '500'}
                    transform={`rotate(-45, ${x}, ${y})`}
                    style={{ transition: 'all 150ms' }}
                  >
                    {truncate(area, 36)}
                  </text>
                </g>
              );
            })}

            {/* Column totals above x-axis labels */}
            {layout.areas.map((area, ci) => {
              const total = layout.areaTotals.get(area) || 0;
              const isFocused = focusedArea === area;
              return (
                <text key={`ct-${area}`}
                  x={padLeft + ci * cellW + cellW / 2}
                  y={padTop + plotH + colTotalH - 6}
                  textAnchor="middle" fontSize="10"
                  fontWeight={isFocused ? '700' : '500'}
                  fill={isFocused ? '#0f172a' : '#94a3b8'}
                  style={{ transition: 'all 150ms' }}
                >
                  {total}
                </text>
              );
            })}

            {/* Axis title for row totals */}
            <text
              x={padLeft + plotW + rowTotalW / 2} y={padTop - 8}
              textAnchor="middle" fontSize="9"
              fontWeight="700" fill="#94a3b8"
              letterSpacing="0.05em"
            >
              ROW
            </text>
            <text
              x={padLeft + plotW + rowTotalW / 2} y={padTop + 4}
              textAnchor="middle" fontSize="9"
              fontWeight="700" fill="#94a3b8"
              letterSpacing="0.05em"
            >
              TOTAL
            </text>
          </svg>
        </div>

        {/* Color legend */}
        <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
              Cell color: paper count
            </span>
            <div className="flex items-center gap-1">
              <span className="text-[10px] text-slate-500 tabular-nums">0</span>
              <div className="h-3 w-32 rounded"
                style={{
                  background: `linear-gradient(to right, ${cellColor(0)}, ${cellColor(layout.maxCount / 2)}, ${cellColor(layout.maxCount)})`,
                  border: '1px solid #e2e8f0',
                }}
              />
              <span className="text-[10px] text-slate-500 tabular-nums">{layout.maxCount}</span>
            </div>
          </div>
          <div className="text-[10px] text-slate-400">
            {layout.cells.length} non-empty cells
          </div>
        </div>

        {/* Drill-down */}
        {selected && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 animate-fade">
            <div className="flex items-start justify-between mb-3 gap-3">
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
                  {selected.type === 'cell' ? 'Papers in this pairing' :
                   selected.type === 'cat' ? 'Papers in this AI model category' :
                   'Papers in this construction application area'}
                </div>
                <div className="text-sm text-slate-900 font-medium break-words">
                  {selected.type === 'cell'
                    ? <span>{selected.cat} <span className="text-slate-400">×</span> {selected.area}</span>
                    : selected.label
                  }
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  {drillPapers.length} unique paper{drillPapers.length !== 1 ? 's' : ''}
                  {selected.type === 'cell' && (() => {
                    const cell = layout.cells.find(c =>
                      c.cat === selected.cat && c.area === selected.area
                    );
                    if (cell && cell.topModels && cell.topModels.length > 0) {
                      return (
                        <span className="text-slate-400">
                          {' · '}Top models: {cell.topModels.map(m => `${m.model} (${m.count})`).join(', ')}
                        </span>
                      );
                    }
                    return null;
                  })()}
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
                  <code className="px-1 bg-slate-200 rounded mx-1">heat_map.csv</code>.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  window.AppCharts.HeatmapChart = HeatmapChart;
})();
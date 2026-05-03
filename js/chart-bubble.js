/* =========================================================
   Bubble chart: Data sources × Validation strategies.
   Dynamic, with live filters, hover highlighting, and click
   to drill down into the papers behind each cell.
   ========================================================= */

window.AppCharts = window.AppCharts || {};

(function() {
  const { useState, useEffect, useMemo } = React;

  const SRC_LABELS = {
    Src_Project_Records_Tabular: 'Project Records/Tabular',
    Src_Site_Images_Video: 'Site Images/Video',
    Src_Simulation_Synthetic_Data: 'Simulation/Synthetic Data',
    Src_Survey_Interview: 'Survey/Interview',
    Src_Text_Documents: 'Text Documents',
    Src_Sensor_IoT_Streams: 'Sensor/IoT Streams',
    Src_Public_Benchmark_Dataset: 'Public Benchmark Dataset',
    Src_BIM_Models: 'BIM Models',
    Src_Bibliometric_Literature_Data: 'Bibliometric/Literature',
    Src_Point_Cloud_LiDAR: 'Point Cloud/LiDAR',
    Src_Audio_Data: 'Audio Data',
  };

  const VAL_LABELS = {
    Val_Comparison_with_Baseline: 'Comparison with Baseline',
    Val_Case_Study: 'Case Study',
    Val_Train_Test_Split: 'Train-Test Split',
    Val_Experimental_Field_Testing: 'Experimental/Field',
    Val_Expert_Judgment: 'Expert Judgment',
    Val_Not_Applicable_Review_Conceptual: 'N/A (Review/Concept.)',
    Val_Simulation: 'Simulation',
    Val_Cross_Validation_K_Fold_LOO: 'Cross-Valid. (K-Fold)',
    Val_Train_Val_Test_Split: 'Train-Val-Test Split',
    Val_SEM_PLS_Analysis: 'SEM/PLS Analysis',
    Val_Survey_Analysis: 'Survey Analysis',
    Val_Ablation_Study: 'Ablation Study',
    Val_Explainability_Analysis_SHAP_XAI: 'Explainability (XAI)',
    Val_Qualitative_Analysis: 'Qualitative Analysis',
    Val_Sensitivity_Analysis: 'Sensitivity Analysis',
    Val_Focus_Group: 'Focus Group',
    Val_Statistical_Analysis: 'Statistical Analysis',
    Val_Cross_Project_Validation: 'Cross-Project Valid.',
    Val_Transfer_Learning: 'Transfer Learning',
  };

  const SIZE_COLOR = {
    'Small (<500)': '#1d4ed8',
    'Medium (500-5,000)': '#06b6d4',
    'Large (5,001-50,000)': '#10b981',
    'Very Large (>50,000)': '#eab308',
    'Not Applicable': '#ec4899',
    'Not Reported': '#94a3b8',
  };

  const BubbleChart = ({ bubbleRows, papersData, onPaperClick }) => {
    const [hover, setHover] = useState(null);
    const [selectedCell, setSelectedCell] = useState(null);
    const [sizeFilter, setSizeFilter] = useState(new Set(Object.keys(SIZE_COLOR)));
    const [minCount, setMinCount] = useState(1);
    const [sortBy, setSortBy] = useState('frequency');
    const [hideEmpty, setHideEmpty] = useState(true);

    const isOne = (v) => String(v).trim() === '1';

    const allCells = useMemo(() => {
      const result = [];
      Object.entries(SRC_LABELS).forEach(([srcCol, srcLabel]) => {
        Object.entries(VAL_LABELS).forEach(([valCol, valLabel]) => {
          const matched = bubbleRows.filter(p => isOne(p[srcCol]) && isOne(p[valCol]));
          if (matched.length === 0) return;
          const sizeCounts = {};
          matched.forEach(p => {
            const s = (p.Dataset_Size_Category || 'Not Reported').trim() || 'Not Reported';
            sizeCounts[s] = (sizeCounts[s] || 0) + 1;
          });
          const dominant = Object.entries(sizeCounts).sort((a, b) => b[1] - a[1])[0][0];
          result.push({
            srcCol, valCol, src: srcLabel, val: valLabel,
            count: matched.length, dominant,
            ids: matched.map(p => p.ID),
          });
        });
      });
      return result;
    }, [bubbleRows]);

    const maxAllCount = useMemo(() =>
      allCells.length > 0 ? Math.max(...allCells.map(c => c.count)) : 1,
      [allCells]
    );

    const visibleCells = useMemo(() =>
      allCells.filter(c => c.count >= minCount && sizeFilter.has(c.dominant)),
      [allCells, minCount, sizeFilter]
    );

    const { visibleSources, visibleValidations } = useMemo(() => {
      let sources = Object.values(SRC_LABELS);
      let validations = Object.values(VAL_LABELS);

      if (hideEmpty) {
        const srcSet = new Set(visibleCells.map(c => c.src));
        const valSet = new Set(visibleCells.map(c => c.val));
        sources = sources.filter(s => srcSet.has(s));
        validations = validations.filter(v => valSet.has(v));
      }

      if (sortBy === 'frequency' || sortBy === 'manuscript') {
        const srcCount = {}, valCount = {};
        visibleCells.forEach(c => {
          srcCount[c.src] = (srcCount[c.src] || 0) + c.count;
          valCount[c.val] = (valCount[c.val] || 0) + c.count;
        });
        sources = [...sources].sort((a, b) => (srcCount[b] || 0) - (srcCount[a] || 0));
        validations = [...validations].sort((a, b) => (valCount[b] || 0) - (valCount[a] || 0));
        if (sortBy === 'manuscript') {
          // Mirror Figure 7: matplotlib places index 0 at the bottom of the Y axis,
          // so the highest-frequency source row appears at the bottom.
          sources = sources.reverse();
        }
      } else {
        sources = [...sources].sort((a, b) => a.localeCompare(b));
        validations = [...validations].sort((a, b) => a.localeCompare(b));
      }
      return { visibleSources: sources, visibleValidations: validations };
    }, [visibleCells, sortBy, hideEmpty]);

    const srcIdx = useMemo(() =>
      Object.fromEntries(visibleSources.map((s, i) => [s, i])),
      [visibleSources]
    );
    const valIdx = useMemo(() =>
      Object.fromEntries(visibleValidations.map((v, i) => [v, i])),
      [visibleValidations]
    );

    const renderCells = useMemo(() =>
      visibleCells.filter(c => c.src in srcIdx && c.val in valIdx),
      [visibleCells, srcIdx, valIdx]
    );

    const cellW = 44;
    const cellH = 40;
    const padLeft = 200;
    const padTop = 24;
    const padBottom = 160;
    const padRight = 30;
    const plotW = visibleValidations.length * cellW;
    const plotH = visibleSources.length * cellH;
    const totalW = padLeft + plotW + padRight;
    const totalH = padTop + plotH + padBottom;

    const radius = (n) => 6 + (Math.sqrt(n) / Math.sqrt(maxAllCount)) * 16;

    const toggleSize = (size) => {
      setSizeFilter(prev => {
        const next = new Set(prev);
        if (next.has(size)) next.delete(size);
        else next.add(size);
        return next;
      });
    };

    const resetFilters = () => {
      setSizeFilter(new Set(Object.keys(SIZE_COLOR)));
      setMinCount(1);
      setSortBy('frequency');
      setHideEmpty(true);
      setSelectedCell(null);
    };

    const selectedPapers = useMemo(() => {
      if (!selectedCell) return [];
      const ids = new Set(selectedCell.ids.map(String));
      return papersData.filter(p => ids.has(String(p.ID)));
    }, [selectedCell, papersData]);

    const totalPapersInView = renderCells.reduce((s, c) => s + c.count, 0);
    const cellsInView = renderCells.length;
    const totalUniquePapers = useMemo(() => {
      const ids = new Set();
      renderCells.forEach(c => c.ids.forEach(id => ids.add(String(id))));
      return ids.size;
    }, [renderCells]);

    const filtersActive =
      sizeFilter.size !== Object.keys(SIZE_COLOR).length ||
      minCount > 1 || sortBy !== 'frequency' || !hideEmpty;

    const legendTicks = [...new Set([
      1,
      Math.max(2, Math.ceil(maxAllCount / 4)),
      Math.max(3, Math.ceil(maxAllCount / 2)),
      maxAllCount
    ])].filter(n => n >= 1).sort((a, b) => a - b);

    const sortOptions = [
      ['frequency', 'Frequency', 'Highest count at top and left, the most intuitive layout for exploration'],
      ['manuscript', 'Manuscript', 'Match Figure 7 in the manuscript: highest-frequency source row at the bottom, leftmost validation column at the top'],
      ['alphabetical', 'A to Z', 'Alphabetical ordering on both axes'],
    ];

    return (
      <div className="space-y-5">
        <div className="space-y-3 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
                Filter by dominant dataset size
              </div>
              {filtersActive && (
                <button
                  onClick={resetFilters}
                  className="text-[11px] text-slate-500 hover:text-slate-900 underline"
                >
                  Reset filters
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(SIZE_COLOR).map(([label, color]) => {
                const active = sizeFilter.has(label);
                return (
                  <button
                    key={label}
                    onClick={() => toggleSize(label)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border flex items-center gap-1.5 ${
                      active ? 'bg-white border-slate-400' : 'bg-slate-50 border-slate-200 opacity-50'
                    }`}
                  >
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                    <span className={active ? 'text-slate-900' : 'text-slate-500'}>{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                Minimum paper count
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min="1"
                  max={maxAllCount}
                  value={minCount}
                  onChange={(e) => setMinCount(parseInt(e.target.value))}
                  className="flex-1 accent-slate-900"
                />
                <span className="text-xs font-medium text-slate-700 tabular-nums w-10 text-right">
                  ≥ {minCount}
                </span>
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                Sort axes by
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sortOptions.map(([k, lbl, tip]) => (
                  <button
                    key={k}
                    onClick={() => setSortBy(k)}
                    title={tip}
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
                Empty axes
              </div>
              <button
                onClick={() => setHideEmpty(!hideEmpty)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-all ${
                  hideEmpty
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
                }`}
              >
                {hideEmpty ? 'Hidden' : 'Shown'}
              </button>
            </div>
          </div>

          <div className="text-[11px] text-slate-500 pt-1 leading-relaxed">
            Displaying <span className="font-semibold text-slate-700">{cellsInView}</span> cells
            across <span className="font-semibold text-slate-700">{visibleSources.length}</span> data sources
            and <span className="font-semibold text-slate-700">{visibleValidations.length}</span> validation strategies,
            covering <span className="font-semibold text-slate-700">{totalUniquePapers}</span> unique papers
            with <span className="font-semibold text-slate-700">{totalPapersInView}</span> total occurrences
            <span className="text-slate-400"> (a paper using multiple sources or strategies appears in more than one cell)</span>.
          </div>
        </div>

        {renderCells.length === 0 ? (
          <div className="text-center py-10 text-sm text-slate-500">
            No cells match the current filters.
            <button onClick={resetFilters} className="ml-2 underline text-slate-700">Reset</button>
          </div>
        ) : (
          <div className="overflow-x-auto scrollbar-thin">
            <svg
              viewBox={`0 0 ${totalW} ${totalH}`}
              style={{ width: '100%', minWidth: Math.min(totalW, 720) + 'px' }}
              preserveAspectRatio="xMidYMid meet"
            >
              {visibleSources.map((_, ri) => (
                <line key={`hr-${ri}`}
                  x1={padLeft} x2={padLeft + plotW}
                  y1={padTop + ri * cellH + cellH / 2}
                  y2={padTop + ri * cellH + cellH / 2}
                  stroke="#f1f5f9" strokeWidth="1"
                />
              ))}
              {visibleValidations.map((_, ci) => (
                <line key={`vr-${ci}`}
                  y1={padTop} y2={padTop + plotH}
                  x1={padLeft + ci * cellW + cellW / 2}
                  x2={padLeft + ci * cellW + cellW / 2}
                  stroke="#f1f5f9" strokeWidth="1"
                />
              ))}

              {hover && (
                <g pointerEvents="none">
                  <rect
                    x={padLeft}
                    y={padTop + (srcIdx[hover.src] ?? 0) * cellH}
                    width={plotW}
                    height={cellH}
                    fill="#0f172a" fillOpacity="0.04"
                  />
                  <rect
                    x={padLeft + (valIdx[hover.val] ?? 0) * cellW}
                    y={padTop}
                    width={cellW}
                    height={plotH}
                    fill="#0f172a" fillOpacity="0.04"
                  />
                </g>
              )}

              {visibleSources.map((src, ri) => (
                <text key={src}
                  x={padLeft - 10}
                  y={padTop + ri * cellH + cellH / 2 + 4}
                  textAnchor="end" fontSize="11"
                  fill={hover && hover.src === src ? '#0f172a' : '#475569'}
                  fontWeight={hover && hover.src === src ? '700' : '500'}
                  style={{ transition: 'all 150ms' }}
                >
                  {src}
                </text>
              ))}

              {visibleValidations.map((val, ci) => {
                const x = padLeft + ci * cellW + cellW / 2;
                const y = padTop + plotH + 14;
                return (
                  <text key={val}
                    x={x} y={y}
                    textAnchor="end" fontSize="11"
                    fill={hover && hover.val === val ? '#0f172a' : '#475569'}
                    fontWeight={hover && hover.val === val ? '700' : '500'}
                    transform={`rotate(-45, ${x}, ${y})`}
                    style={{ transition: 'all 150ms' }}
                  >
                    {val}
                  </text>
                );
              })}

              {renderCells.map((c, i) => {
                const cx = padLeft + valIdx[c.val] * cellW + cellW / 2;
                const cy = padTop + srcIdx[c.src] * cellH + cellH / 2;
                const r = radius(c.count);
                const isHover = hover === c;
                const isSelected = selectedCell &&
                  selectedCell.src === c.src && selectedCell.val === c.val;
                return (
                  <g key={`${c.src}-${c.val}`}
                    onMouseEnter={() => setHover(c)}
                    onMouseLeave={() => setHover(null)}
                    onClick={() => setSelectedCell(isSelected ? null : c)}
                    style={{ cursor: 'pointer' }}
                  >
                    <circle
                      cx={cx} cy={cy} r={r}
                      fill={SIZE_COLOR[c.dominant] || '#94a3b8'}
                      fillOpacity={isHover || isSelected ? 1 : 0.82}
                      stroke={isSelected ? '#0f172a' : (isHover ? '#0f172a' : '#ffffff')}
                      strokeWidth={isSelected ? 2.5 : (isHover ? 2 : 1.5)}
                      style={{ transition: 'all 150ms' }}
                    />
                    <text
                      x={cx} y={cy + 3.5}
                      textAnchor="middle"
                      fontSize={r >= 13 ? '10' : '9'}
                      fontWeight="700"
                      fill="#ffffff"
                      pointerEvents="none"
                    >
                      {c.count}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-3 border-t border-slate-100">
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
              Color: Dominant dataset size
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-1.5">
              {Object.entries(SIZE_COLOR).map(([label, color]) => (
                <div key={label} className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
                  <span className="text-xs text-slate-600">{label}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
              Bubble area: Paper count
            </div>
            <div className="flex items-end gap-3">
              {legendTicks.map(n => (
                <div key={n} className="flex flex-col items-center gap-1">
                  <svg width={radius(n) * 2 + 4} height={radius(n) * 2 + 4}>
                    <circle cx={radius(n) + 2} cy={radius(n) + 2} r={radius(n)}
                      fill="#94a3b8" fillOpacity="0.7" />
                  </svg>
                  <span className="text-[10px] text-slate-500 tabular-nums">{n}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {selectedCell && (
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 animate-fade">
            <div className="flex items-start justify-between mb-3 gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
                  Papers in this cell
                </div>
                <div className="text-sm text-slate-900 font-medium">
                  {selectedCell.src} <span className="text-slate-400">×</span> {selectedCell.val}
                </div>
                <div className="text-xs text-slate-600 mt-0.5">
                  {selectedCell.count} paper{selectedCell.count > 1 ? 's' : ''}
                  <span className="text-slate-400"> · </span>
                  Dominant size: <span className="inline-flex items-center gap-1">
                    <span className="inline-block w-2 h-2 rounded-full"
                      style={{ backgroundColor: SIZE_COLOR[selectedCell.dominant] || '#94a3b8' }} />
                    {selectedCell.dominant}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setSelectedCell(null)}
                className="text-slate-400 hover:text-slate-900 text-xl leading-none w-7 h-7 flex items-center justify-center rounded hover:bg-slate-200 flex-shrink-0"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin">
              {selectedPapers.length > 0 ? selectedPapers.map((p, i) => (
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
                  Paper records could not be matched. Confirm that the ID column in
                  <code className="px-1 bg-slate-200 rounded mx-1">data.csv</code>
                  aligns with
                  <code className="px-1 bg-slate-200 rounded mx-1">bubble_chart.csv</code>.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  window.AppCharts.BubbleChart = BubbleChart;
})();
(function() {
  const { useState, useEffect, useMemo } = React;
  const { splitMulti, uniqueValues, countBy } = window.AppUtils;
  const { BarChart, YearChart, BubbleChart, SankeyChart, HeatmapChart, AIChat } = window.AppCharts;
  const { PaperCard, PaperModal, StatCard, ChartCard, FilterGroup } = window.AppComponents;

  const GEMINI_WORKER_BASE = 'https://cm-electriai-proxy.chauducanh.workers.dev';

  const GEMINI_API_KEY = 'YOUR_API_KEY_HERE';

  function App() {
    const [data, setData] = useState([]);
    const [bubbleData, setBubbleData] = useState([]);
    const [sankeyData, setSankeyData] = useState([]);
    const [heatmapData, setHeatmapData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [tab, setTab] = useState('overview');
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState({
      years: new Set(),
      countries: new Set(),
      journals: new Set(),
      applicationAreas: new Set(),
      methods: new Set(),
    });
    const [selectedPaper, setSelectedPaper] = useState(null);
    const [showFilters, setShowFilters] = useState(false);

    useEffect(() => {
      const loadCSV = (path) => new Promise((resolve, reject) => {
        Papa.parse(path, {
          download: true,
          header: true,
          skipEmptyLines: true,
          complete: (results) => resolve(results.data),
          error: (err) => reject(err),
        });
      });

      Promise.all([
        loadCSV('./data.csv'),
        loadCSV('./bubble_chart.csv').catch(() => []),
        loadCSV('./sankey_diagram.csv').catch(() => []),
        loadCSV('./heat_map.csv').catch(() => []),
      ])
        .then(([papers, bubble, sankey, heatmap]) => {
          const cleaned = papers
            .filter(r => r.Title && r.Title.trim())
            .map(r => ({ ...r, Year: r.Year ? String(r.Year).trim() : '' }));
          setData(cleaned);
          setBubbleData(bubble);
          setSankeyData(sankey);
          setHeatmapData(heatmap);
          setLoading(false);
        })
        .catch((err) => {
          setError(err.message);
          setLoading(false);
        });
    }, []);

    const toggleFilter = (cat, value) => {
      setFilters(prev => {
        const next = { ...prev, [cat]: new Set(prev[cat]) };
        if (next[cat].has(value)) next[cat].delete(value);
        else next[cat].add(value);
        return next;
      });
    };

    const clearFilters = () => {
      setFilters({
        years: new Set(),
        countries: new Set(),
        journals: new Set(),
        applicationAreas: new Set(),
        methods: new Set(),
      });
      setSearch('');
    };

    const drillDown = (category, value) => {
      setFilters(prev => ({
        ...prev,
        [category]: new Set([value]),
      }));
      setTab('papers');
      setShowFilters(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const filtered = useMemo(() => {
      const q = search.trim().toLowerCase();
      return data.filter(r => {
        if (filters.years.size > 0 && !filters.years.has(r.Year)) return false;
        if (filters.journals.size > 0 && !filters.journals.has(r.Journal)) return false;
        if (filters.methods.size > 0 && !filters.methods.has(r['Research Method'])) return false;
        if (filters.countries.size > 0) {
          const locs = splitMulti(r['Research Location']);
          if (!locs.some(l => filters.countries.has(l))) return false;
        }
        if (filters.applicationAreas.size > 0 && !filters.applicationAreas.has(r['Construction Topic'])) return false;
        if (q) {
          const blob = [r.Title, r.Abstract, r.Authors, r['AI Model Used'], r['Construction Topic']]
            .filter(Boolean).join(' ').toLowerCase();
          if (!blob.includes(q)) return false;
        }
        return true;
      });
    }, [data, filters, search]);

    const totalFilters = Object.values(filters).reduce((sum, s) => sum + s.size, 0);

    const yearCounts = useMemo(() => {
      const counts = countBy(data, 'Year');
      return counts.sort((a, b) => a[0].localeCompare(b[0]));
    }, [data]);

    const journalCounts = useMemo(() => countBy(data, 'Journal'), [data]);
    const countryCounts = useMemo(() => countBy(data, 'Research Location', true), [data]);
    const topicCounts = useMemo(() => countBy(data, 'Construction Topic'), [data]);
    const aiCounts = useMemo(() => countBy(data, 'AI Model Used', true), [data]);

    const allYears = useMemo(() => uniqueValues(data, 'Year').sort((a, b) => b.localeCompare(a)), [data]);
    const allCountries = useMemo(() => uniqueValues(data, 'Research Location', true), [data]);
    const allJournals = useMemo(() => uniqueValues(data, 'Journal'), [data]);
    const allTopics = useMemo(() => uniqueValues(data, 'Construction Topic'), [data]);
    const allMethods = useMemo(() => uniqueValues(data, 'Research Method'), [data]);

    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mb-3"></div>
            <p className="text-sm text-slate-500">Loading review data…</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <p className="text-sm text-red-600 mb-2">Could not load data files</p>
            <p className="text-xs text-slate-500">{error}</p>
            <p className="text-xs text-slate-500 mt-3">
              Make sure data.csv, bubble_chart.csv, sankey_diagram.csv, and heat_map.csv are in the same folder as index.html, and that the page is served over HTTP (not opened directly as a file).
            </p>
          </div>
        </div>
      );
    }

    const minYear = data.length > 0 ? Math.min(...data.map(r => parseInt(r.Year)).filter(Boolean)) : '2006';
    const maxYear = data.length > 0 ? Math.max(...data.map(r => parseInt(r.Year)).filter(Boolean)) : '2026';

    return (
      <div className="min-h-screen">
        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="serif text-base sm:text-lg font-semibold text-slate-900 leading-tight">
                AI in Construction Management
              </h1>
              <p className="text-[11px] text-slate-500">Systematic Review Database, n = {data.length}</p>
            </div>
            <nav className="flex gap-1 text-sm">
              {[['overview', 'Findings'], ['papers', 'Papers'], ['ai', 'AI Assistant'], ['about', 'About']].map(([k, lbl]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    tab === k ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">

          {tab === 'overview' && (
            <div className="space-y-10 animate-fade">
              <section className="text-center max-w-3xl mx-auto pt-4 pb-2">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Systematic Review</p>
                <h2 className="serif text-3xl sm:text-5xl font-semibold text-slate-900 leading-[1.1] tracking-tight">
                  Mapping artificial intelligence applications across the construction lifecycle
                </h2>
                <p className="text-slate-600 mt-5 leading-relaxed text-base sm:text-lg max-w-2xl mx-auto">
                  A PRISMA-guided synthesis of {data.length} peer-reviewed articles published between {minYear} and {maxYear}, integrating bibliometric and thematic analysis.
                </p>
              </section>

              <section className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <StatCard label="Articles reviewed" value={data.length} />
                <StatCard label="Source journals" value={journalCounts.length} />
                <StatCard label="Countries represented" value={countryCounts.length} />
                <StatCard label="AI techniques identified" value={aiCounts.length} />
              </section>

              <section>
                <div className="flex items-baseline justify-between mb-4">
                  <h3 className="serif text-xl font-semibold text-slate-900">At a glance</h3>
                  <p className="text-xs text-slate-400 italic">Charts are interactive, click any bar to filter the paper list</p>
                </div>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <ChartCard title="Publication output by year" subtitle="Annual distribution of reviewed articles">
                    <YearChart data={yearCounts} onItemClick={(y) => drillDown('years', y)} />
                  </ChartCard>
                  <ChartCard title="Top contributing countries" subtitle="By number of authoring affiliations">
                    <BarChart data={countryCounts} max={8} accent="#0f172a"
                      totalCount={data.length} onItemClick={(c) => drillDown('countries', c)} />
                  </ChartCard>
                  <ChartCard title="Source journals" subtitle="Top venues by paper count">
                    <BarChart data={journalCounts} max={10} accent="#334155"
                      totalCount={data.length} onItemClick={(j) => drillDown('journals', j)} />
                  </ChartCard>
                  <ChartCard title="Construction topics" subtitle="Most studied application areas">
                    <BarChart data={topicCounts} max={10} accent="#475569"
                      totalCount={data.length} onItemClick={(t) => drillDown('applicationAreas', t)} />
                  </ChartCard>
                </div>
              </section>

              {bubbleData.length > 0 && (
                <section>
                  <ChartCard
                    title="Data sources, validation strategies, and dataset sizes"
                    subtitle="Bubble size encodes paper count, color encodes the dominant dataset size category. Hover to inspect, click any bubble to drill down to the underlying papers. Use the Manuscript sort option to align the layout with Figure 7 of the paper."
                  >
                    <BubbleChart
                      bubbleRows={bubbleData}
                      papersData={data}
                      onPaperClick={(p) => setSelectedPaper(p)}
                    />
                  </ChartCard>
                </section>
              )}

              {sankeyData.length > 0 && (
                <section>
                  <ChartCard
                    title="AI techniques, methodological groupings, and overarching themes"
                    subtitle="Ribbon widths represent the number of reviewed papers flowing from each AI technique to a methodological grouping and on to an overarching research theme. Hover any element to highlight its full upstream and downstream path; click to drill down to the underlying papers."
                  >
                    <SankeyChart
                      sankeyRows={sankeyData}
                      papersData={data}
                      onPaperClick={(p) => setSelectedPaper(p)}
                    />
                  </ChartCard>
                </section>
              )}

              {heatmapData.length > 0 && (
                <section>
                  <ChartCard
                    title="AI model categories across construction application areas"
                    subtitle="Cell color saturation encodes paper count, revealing technique-domain concentration patterns. Click a cell to drill down to a specific pairing, or click a row or column label to see all papers in that category or domain. By default the No Specific AI Model / Review Studies category is excluded so the matrix focuses on papers that implement a concrete model."
                  >
                    <HeatmapChart
                      heatmapRows={heatmapData}
                      papersData={data}
                      onPaperClick={(p) => setSelectedPaper(p)}
                    />
                  </ChartCard>
                </section>
              )}

              <div className="text-center pt-4">
                <button
                  onClick={() => setTab('papers')}
                  className="px-5 py-2.5 bg-slate-900 text-white text-sm font-medium rounded-lg hover:bg-slate-800 transition-colors"
                >
                  Explore the {data.length} reviewed papers →
                </button>
              </div>
            </div>
          )}

          {tab === 'papers' && (
            <div className="animate-fade">
              <div className="bg-white border border-slate-200 rounded-lg p-4 mb-5 sticky top-[73px] z-20">
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="flex-1 relative">
                    <input
                      type="text"
                      placeholder="Search title, authors, abstract, AI model…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
                    />
                    {search && (
                      <button
                        onClick={() => setSearch('')}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 text-sm"
                      >×</button>
                    )}
                  </div>
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className="px-3 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-md hover:bg-slate-50 transition-colors flex items-center gap-2"
                  >
                    Filters
                    {totalFilters > 0 && (
                      <span className="bg-slate-900 text-white text-[10px] px-1.5 py-0.5 rounded-full">{totalFilters}</span>
                    )}
                  </button>
                  {(totalFilters > 0 || search) && (
                    <button
                      onClick={clearFilters}
                      className="px-3 py-2 text-sm text-slate-500 hover:text-slate-900 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {showFilters && (
                  <div className="mt-4 pt-4 border-t border-slate-100 space-y-3 max-h-[40vh] overflow-y-auto scrollbar-thin">
                    <FilterGroup label="Year" values={allYears} active={filters.years} onToggle={(v) => toggleFilter('years', v)} />
                    <FilterGroup label="Research Method" values={allMethods} active={filters.methods} onToggle={(v) => toggleFilter('methods', v)} />
                    <FilterGroup label="Construction Topic" values={allTopics} active={filters.applicationAreas} onToggle={(v) => toggleFilter('applicationAreas', v)} truncate={50} />
                    <FilterGroup label="Country" values={allCountries} active={filters.countries} onToggle={(v) => toggleFilter('countries', v)} />
                    <FilterGroup label="Journal" values={allJournals} active={filters.journals} onToggle={(v) => toggleFilter('journals', v)} truncate={45} />
                  </div>
                )}

                <div className="mt-3 text-xs text-slate-500">
                  Showing <span className="font-medium text-slate-900 tabular-nums">{filtered.length}</span> of {data.length} papers
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="text-center py-16 text-slate-500">
                  <p className="text-sm">No papers match the current filters.</p>
                  <button onClick={clearFilters} className="text-xs text-slate-700 underline mt-2">Reset filters</button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filtered.map((paper, i) => (
                    <PaperCard key={i} paper={paper} onClick={() => setSelectedPaper(paper)} />
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'ai' && (
            <div className="animate-fade max-w-4xl">
              <div className="mb-6">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">AI Assistant</p>
                <h2 className="serif text-2xl sm:text-3xl font-semibold text-slate-900 leading-tight">
                  Ask the reviewed literature
                </h2>
                <p className="text-slate-600 mt-2 leading-relaxed text-sm sm:text-base">
                  Free-form Q&amp;A grounded in the {data.length} reviewed papers. Each question retrieves the most relevant papers via semantic search and asks Gemini to answer with citations. Click any citation chip in the answer or any paper in the references list to open its full record.
                </p>
              </div>
              <AIChat
                papersData={data}
                apiKey={GEMINI_API_KEY}
                workerBase={GEMINI_WORKER_BASE}
                onPaperClick={(p) => setSelectedPaper(p)}
              />
            </div>
          )}

          {tab === 'about' && (
            <div className="max-w-2xl animate-fade serif">
              <h2 className="text-2xl font-semibold text-slate-900 mb-4">About this database</h2>
              <p className="text-slate-700 leading-relaxed mb-4">
                This site presents the dataset underlying a systematic review of artificial intelligence applications in construction management. The review followed the PRISMA 2020 protocol and integrated bibliometric mapping with thematic content analysis across {data.length} peer-reviewed articles.
              </p>
              <p className="text-slate-700 leading-relaxed mb-4">
                Data are sourced from Scopus and cover the {minYear} to {maxYear} period across {journalCounts.length} journals. Each record includes bibliographic metadata, application domain, AI model employed, methodology, dataset characteristics, and reported gaps and future directions.
              </p>
              <h3 className="text-base font-semibold text-slate-900 mt-6 mb-2">Citation</h3>
              <p className="text-sm text-slate-600 leading-relaxed bg-slate-50 border border-slate-200 rounded-md p-3 font-mono">
                [Author(s)]. ({new Date().getFullYear()}). A Systematic Review of Artificial Intelligence Applications in Construction Management. International Journal of Construction Management.
              </p>
              <h3 className="text-base font-semibold text-slate-900 mt-6 mb-2">Updates</h3>
              <p className="text-slate-700 leading-relaxed">
                The dataset is maintained as CSV files alongside this page. To update, replace data.csv, bubble_chart.csv, sankey_diagram.csv, or heat_map.csv in the repository and the visualisation will reflect the new content on next load.
              </p>
            </div>
          )}
        </main>

        <footer className="border-t border-slate-200 mt-12 py-6">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 text-xs text-slate-500 flex flex-col sm:flex-row justify-between gap-2">
            <span>Systematic Review Database · Built with React and Tailwind</span>
            <span>Data: data.csv, bubble_chart.csv, sankey_diagram.csv, heat_map.csv · Last updated dynamically on load</span>
          </div>
        </footer>

        {selectedPaper && <PaperModal paper={selectedPaper} onClose={() => setSelectedPaper(null)} />}
      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
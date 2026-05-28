/* ElectriAI Research companion webapp — root shell.

   Responsibilities:
     - Load the five eager JSON datasets exported by src/web/export_data.py.
     - Lazy-load the wiki embeddings and chunks the first time the user
       opens the Ask ElectriAI tab (they are ~3 MB combined).
     - Render the header + four-tab navigation and dispatch to the
       per-tab root components registered on window.AppOverview /
       AppFindings / AppComments / AppChat.
     - Surface a single Gemini dev key from localStorage, but only when
       running on localhost so the key cannot leak in production. */

(function() {
  const { useState, useEffect, useMemo } = React;
  const { ResearchTab } = window.AppResearch;
  const { CommentsTab } = window.AppComments;
  const { ChatTab } = window.AppChat;
  const { AboutTab } = window.AppAbout;

  // Localhost-only Gemini dev key. In production this stays empty and
  // the Ask ElectriAI tab will route through the Cloudflare Worker instead.
  const isLocalhost =
    location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const GEMINI_DEV_KEY = isLocalhost
    ? (localStorage.getItem('GEMINI_DEV_KEY') || '')
    : '';

  // Cloudflare Worker base URL for the production embed + generate proxy.
  // Wired up in Phase 3; harmless to leave defined here while skipped.
  const GEMINI_WORKER_BASE = 'https://cm-electriai-proxy.chauducanh.workers.dev';

  const TABS = [
    { id: 'research', label: 'Research Results' },
    { id: 'chat',     label: 'Ask ElectriAI' },
    { id: 'comments', label: 'Raw Data' },
    { id: 'about',    label: 'About' },
  ];

  // Tiny fetch + JSON helper that throws on a non-2xx response so the
  // error toast surfaces an actual reason rather than a silent parse failure.
  const fetchJSON = (path) =>
    fetch(path).then(r => {
      if (!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
      return r.json();
    });

  function App() {
    // Eagerly loaded datasets. All `null` until the initial load promise resolves.
    const [comments, setComments]   = useState(null);
    const [categories, setCategories] = useState(null);
    const [stats, setStats]         = useState(null);
    const [themeDict, setThemeDict] = useState(null);
    const [wikiPages, setWikiPages] = useState(null);
    const [bottleneck, setBottleneck] = useState(null);

    // Lazy-loaded datasets, only fetched once the Ask ElectriAI tab is opened.
    const [wikiEmbeddings, setWikiEmbeddings] = useState(null);
    const [wikiChunks, setWikiChunks]         = useState(null);
    const [embeddingsLoading, setEmbeddingsLoading] = useState(false);

    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    const [tab, setTab]         = useState('research');

    function changeTab(nextTab) {
      setTab(nextTab);
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    // Eager data load: comments, categories, stats, theme dictionary, wiki page list.
    useEffect(() => {
      Promise.all([
        fetchJSON('./data/comments.json'),
        fetchJSON('./data/categories.json'),
        fetchJSON('./data/summary_stats.json'),
        fetchJSON('./data/theme_dictionary.json'),
        fetchJSON('./data/wiki_pages.json'),
        fetchJSON('./data/knowledge_bottleneck.json'),
      ])
        .then(([commentsDoc, categoriesDoc, statsDoc, themeDoc, wikiDoc, bottleneckDoc]) => {
          // The export pipeline wraps lists in { meta, records | pages },
          // so unwrap to the array shape every tab expects.
          setComments(commentsDoc.records || commentsDoc);
          setCategories(categoriesDoc);
          setStats(statsDoc);
          setThemeDict(themeDoc.themes || themeDoc);
          setWikiPages(wikiDoc.pages || wikiDoc);
          setBottleneck(bottleneckDoc);
          setLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setLoading(false);
        });
    }, []);

    // Lazy wiki retrieval load: trigger the first time the chat tab is shown.
    useEffect(() => {
      if (tab !== 'chat') return;
      if (wikiEmbeddings || embeddingsLoading) return;
      setEmbeddingsLoading(true);
      Promise.all([
        fetchJSON('./data/wiki_embeddings.json'),
        fetchJSON('./data/wiki_chunks.json'),
      ])
        .then(([embeddings, chunks]) => {
          setWikiEmbeddings(embeddings);
          setWikiChunks(chunks);
          setEmbeddingsLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setEmbeddingsLoading(false);
        });
    }, [tab, wikiEmbeddings, embeddingsLoading]);

    // Single state bag passed down to every tab so they share a stable shape.
    const state = useMemo(() => ({
      comments,
      categories,
      stats,
      themeDict,
      wikiPages,
      wikiEmbeddings,
      wikiChunks,
      bottleneck,
      geminiDevKey: GEMINI_DEV_KEY,
      geminiWorkerBase: GEMINI_WORKER_BASE,
    }), [comments, categories, stats, themeDict, wikiPages, wikiEmbeddings, wikiChunks, bottleneck]);

    if (loading) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mb-3"></div>
            <p className="text-sm text-slate-500">Loading ElectriAI data…</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="min-h-screen flex items-center justify-center px-6">
          <div className="max-w-md text-center">
            <p className="text-sm text-red-600 mb-2">Could not load ElectriAI data</p>
            <p className="text-xs text-slate-500 break-all">{error}</p>
            <p className="text-xs text-slate-500 mt-3">
              Make sure the JSON files are in <code>web_app/data/</code> and that
              the page is served over HTTP (use <code>python -m http.server</code>),
              not opened from the filesystem.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen">

        <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="serif text-base sm:text-lg font-semibold text-slate-900 leading-tight truncate">
                ElectriAI Research
              </h1>
              <p className="text-[11px] text-slate-500 truncate">
                YouTube Q&amp;A knowledge for electrical contractors&nbsp;·&nbsp;
                <a href="#" className="underline hover:text-slate-700">paper preprint (coming soon)</a>
              </p>
            </div>
            <nav className="flex gap-1 text-sm">
              {TABS.map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => changeTab(id)}
                  className={`px-3 py-1.5 rounded-md font-medium transition-colors ${
                    tab === id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {label}
                </button>
              ))}
            </nav>
          </div>
        </header>

        <main className="max-w-6xl mx-auto px-4 sm:px-6">
          {tab === 'research' && <ResearchTab state={state} />}
          {tab === 'comments' && <CommentsTab state={state} />}
          {tab === 'chat' && (
            <ChatTab
              state={state}
              embeddingsLoading={embeddingsLoading}
              embeddingsReady={Boolean(wikiEmbeddings)}
              devKeyAvailable={Boolean(GEMINI_DEV_KEY)}
            />
          )}
          {tab === 'about' && <AboutTab />}
        </main>

        <footer className="border-t border-slate-200 mt-12 py-6">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 text-xs text-slate-500 flex flex-col sm:flex-row justify-between gap-2">
            <span>ElectriAI Research companion site · React + Tailwind, no build step</span>
            <span>
              Data generated {stats && stats.generatedAt ? stats.generatedAt.slice(0, 10) : '—'}
            </span>
          </div>
        </footer>

      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();

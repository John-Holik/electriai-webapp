/* ElectriAI Research companion webapp, root shell.

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
  const { RawDataTab } = window.AppRawData;
  const { ChatTab } = window.AppChat;
  const { AboutTab } = window.AppAbout;
  const { QATab } = window.AppQA;

  // Localhost-only Gemini dev key. In production this stays empty and
  // the Ask ElectriAI tab will route through the Cloudflare Worker instead.
  const isLocalhost =
    location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const GEMINI_DEV_KEY = isLocalhost
    ? (localStorage.getItem('GEMINI_DEV_KEY') || '')
    : '';

  // Cloudflare Worker base URL for the production embed + generate proxy.
  // Wired up in Phase 3; harmless to leave defined here while skipped.
  const GEMINI_WORKER_BASE = 'https://youtube.electriai.com';

  const TABS = [
    { id: 'research', label: 'Findings' },
    { id: 'qa',       label: 'Questions & Answers' },
    { id: 'chat',     label: 'Ask the Knowledge Base' },
    { id: 'rawdata',  label: 'Videos & Comments' },
    { id: 'comments', label: 'Validation Set' },
    { id: 'about',    label: 'About' },
  ];

  // Tiny fetch + JSON helper that throws on a non-2xx response so the
  // error toast surfaces an actual reason rather than a silent parse failure.
  const fetchJSON = (path) =>
    // 'no-cache' revalidates with the server on every load, so a regenerated
    // data file is never masked by a stale browser copy (it still uses the
    // cached bytes when the server confirms 304 Not Modified).
    fetch(path, { cache: 'no-cache' }).then(r => {
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
    const [kbMeta, setKbMeta]       = useState(null);
    const [taxonomyFigures, setTaxonomyFigures] = useState(null);
    const [bottleneck, setBottleneck] = useState(null);

    // Lazy-loaded datasets, only fetched once the Ask ElectriAI tab is opened.
    const [wikiEmbeddings, setWikiEmbeddings] = useState(null);
    const [wikiChunks, setWikiChunks]         = useState(null);
    const [embeddingsLoading, setEmbeddingsLoading] = useState(false);

    // Lazy-loaded raw video dataset, only fetched once the Raw Data tab is opened.
    const [rawVideos, setRawVideos]           = useState(null);
    const [rawVideosLoading, setRawVideosLoading] = useState(false);

    // Lazy-loaded question dictionary datasets, only fetched once the
    // Questions & Answers tab is opened.
    const [qaTaxonomy, setQaTaxonomy] = useState(null);
    const [qaRecords, setQaRecords]   = useState(null);
    const [qaLoading, setQaLoading]   = useState(false);

    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);
    // Tab persists in the URL hash so refresh, browser back/forward, and
    // shared links all land on the same tab. Falls back to 'research' if
    // the hash is empty or names an unknown tab.
    const tabIds = TABS.map((t) => t.id);
    const initialTab = (() => {
      const hash = (window.location.hash || '').replace(/^#/, '');
      return tabIds.includes(hash) ? hash : 'research';
    })();
    const [tab, setTab] = useState(initialTab);

    // Cross-tab navigation intent. Set by one tab (e.g. the chat panel
    // wants to open a specific video in Raw Data), consumed and cleared
    // by the destination tab. Carries { videoId, commentId } payloads.
    const [navIntent, setNavIntent] = useState(null);

    function changeTab(nextTab) {
      setTab(nextTab);
      if (window.location.hash.replace(/^#/, '') !== nextTab) {
        window.history.pushState(null, '', `#${nextTab}`);
      }
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }

    // Helper: navigate to another tab with an optional context payload.
    function navigate(nextTab, payload) {
      if (payload) setNavIntent(payload);
      changeTab(nextTab);
    }

    // Sync state when the user uses browser back/forward.
    useEffect(() => {
      const onHashChange = () => {
        const next = (window.location.hash || '').replace(/^#/, '');
        if (tabIds.includes(next)) setTab(next);
      };
      window.addEventListener('hashchange', onHashChange);
      return () => window.removeEventListener('hashchange', onHashChange);
    }, []);

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

    // Lazy raw-videos load. Triggered when the user opens Raw Data (the
    // primary consumer) or Ask ElectriAI (so chat (Q:...) citations can
    // resolve to YouTube comment deep-links via the commentId→videoId map).
    useEffect(() => {
      if (tab !== 'rawdata' && tab !== 'chat') return;
      if (rawVideos || rawVideosLoading) return;
      setRawVideosLoading(true);
      fetchJSON('./data/raw_videos.json')
        .then(doc => {
          setRawVideos(doc);
          setRawVideosLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setRawVideosLoading(false);
        });
    }, [tab, rawVideos, rawVideosLoading]);

    // Lazy question-dictionary load: trigger the first time the QA tab is shown.
    useEffect(() => {
      if (tab !== 'qa') return;
      if (qaTaxonomy || qaLoading) return;
      setQaLoading(true);
      Promise.all([
        fetchJSON('./data/qa_taxonomy.json'),
        fetchJSON('./data/qa_records.json'),
      ])
        .then(([taxonomyDoc, recordsDoc]) => {
          setQaTaxonomy(taxonomyDoc);
          setQaRecords(recordsDoc);
          setQaLoading(false);
        })
        .catch(err => {
          setError(err.message);
          setQaLoading(false);
        });
    }, [tab, qaTaxonomy, qaLoading]);

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
      rawVideos,
      qaTaxonomy,
      qaRecords,
      geminiDevKey: GEMINI_DEV_KEY,
      geminiWorkerBase: GEMINI_WORKER_BASE,
    }), [comments, categories, stats, themeDict, wikiPages, wikiEmbeddings, wikiChunks, bottleneck, rawVideos, qaTaxonomy, qaRecords]);

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
          <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between gap-8">
            <div className="min-w-0 flex-1">
              <h1 className="serif text-base sm:text-lg font-semibold text-slate-900 leading-tight whitespace-nowrap">
                Practitioner Knowledge Base for Electrical Construction
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-500 leading-tight mt-0.5">
                Identifying knowledge bottlenecks in electrical construction from practitioner discussion on YouTube using large language models
              </p>
            </div>
            <nav className="flex flex-wrap gap-1 text-sm shrink-0">
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
          {tab === 'qa' && <QATab state={state} loading={qaLoading} />}
          {tab === 'rawdata' && (
            <RawDataTab
              state={state}
              loading={rawVideosLoading}
              navIntent={navIntent}
              clearNavIntent={() => setNavIntent(null)}
            />
          )}
          {tab === 'comments' && <CommentsTab state={state} />}
          {tab === 'chat' && (
            <ChatTab
              state={state}
              embeddingsLoading={embeddingsLoading}
              embeddingsReady={Boolean(wikiEmbeddings)}
              devKeyAvailable={Boolean(GEMINI_DEV_KEY)}
              navigate={navigate}
              rawVideosLoading={rawVideosLoading}
            />
          )}
          {tab === 'about' && <AboutTab />}
        </main>

        <footer className="border-t border-slate-200 mt-12 py-6">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 text-xs text-slate-500 flex flex-col gap-2">
            <span>Companion site for the study "Identifying Knowledge Bottlenecks in Electrical Construction from Practitioner Discussion on YouTube Using Large Language Models"</span>
            <span>Manuscript under review · React and Tailwind single-page application served over a global CDN with a serverless API gateway · Data generated May 2026</span>
          </div>
        </footer>

      </div>
    );
  }

  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();

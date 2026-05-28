/* Raw Data tab. Provides a sidebar of filters (category,
   has-replies, top themes, video) plus a debounced text search over
   commentText and videoTitle. Filtered rows render as paginated
   CommentCard tiles; clicking a card opens a full-detail CommentModal
   that surfaces every label the export pipeline produced. */

window.AppComments = (function() {
  const { useState, useEffect, useMemo, useRef } = React;
  const { Chip, CategoryBadge, ThemeBar } = window.AppComponents;
  const { categoryByCode, formatNumber } = window.AppUtils;

  const PAGE_SIZE = 25;
  const TOP_THEME_COUNT = 15;
  const COMMENT_SNIPPET_CHARS = 280;

  // Sorts a {themeName: weight} dict into descending-weight pairs.
  const sortedThemes = (themes) => {
    if (!themes || typeof themes !== 'object') return [];
    return Object.entries(themes)
      .map(([name, weight]) => [name, Number(weight) || 0])
      .sort((a, b) => b[1] - a[1]);
  };

  // Counts how many comments mention each theme key. Returns descending pairs.
  const computeThemeFrequencies = (comments) => {
    const counts = new Map();
    for (const r of comments) {
      const themes = r.themes;
      if (!themes) continue;
      for (const t of Object.keys(themes)) {
        counts.set(t, (counts.get(t) || 0) + 1);
      }
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  };

  // Tiny debounce hook so the search box does not re-filter on every keystroke.
  const useDebouncedValue = (value, ms) => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
      const id = setTimeout(() => setDebounced(value), ms);
      return () => clearTimeout(id);
    }, [value, ms]);
    return debounced;
  };

  // Locks page scroll while the modal is open and wires Escape to close.
  const useModalKeybind = (active, onClose) => {
    useEffect(() => {
      if (!active) return;
      const handler = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handler);
        document.body.style.overflow = '';
      };
    }, [active, onClose]);
  };

  // Collapsed-row card used in the result grid.
  const CommentCard = ({ comment, category, onClick }) => {
    const [expanded, setExpanded] = useState(false);
    const text = comment.commentText || '';
    const needsTruncate = text.length > COMMENT_SNIPPET_CHARS;
    const shownText = expanded || !needsTruncate ? text : text.slice(0, COMMENT_SNIPPET_CHARS).trimEnd() + '…';
    const topThemes = sortedThemes(comment.themes).slice(0, 3);
    const color = category ? category.color : '#94a3b8';

    return (
      <article
        onClick={onClick}
        className="bg-white border border-slate-200 rounded-lg p-5 hover:border-slate-400 hover:shadow-sm transition-all cursor-pointer animate-fade"
      >
        <div className="flex items-center justify-between gap-2 mb-3">
          {category ? (
            <CategoryBadge code={category.code} name={category.name} color={category.color} />
          ) : (
            <span className="text-[11px] text-slate-500">Unlabeled</span>
          )}
          <span className="text-[11px] text-slate-400 tabular-nums">
            #{comment.recordId}
          </span>
        </div>

        <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap mb-3">
          {shownText}
          {needsTruncate && (
            <button
              onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
              className="ml-1 text-[11px] text-slate-500 underline hover:text-slate-900"
            >
              {expanded ? 'show less' : 'show more'}
            </button>
          )}
        </p>

        <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-x-3 gap-y-1 mb-3">
          <a
            href={comment.videoUrl}
            target="_blank"
            rel="noopener"
            onClick={(e) => e.stopPropagation()}
            className="text-slate-600 hover:text-slate-900 underline underline-offset-2 truncate max-w-[60%]"
            title={comment.videoTitle}
          >
            {comment.videoTitle}
          </a>
          <span>{formatNumber(comment.replyCount)} {comment.replyCount === 1 ? 'reply' : 'replies'}</span>
        </div>

        {topThemes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {topThemes.map(([name, weight]) => (
              <span
                key={name}
                className="text-[10px] uppercase tracking-wide font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded"
                style={{ borderLeft: `3px solid ${color}` }}
              >
                {name} <span className="opacity-70 tabular-nums">{weight}%</span>
              </span>
            ))}
          </div>
        )}
      </article>
    );
  };

  // Single Q/A row in the modal's bottom block. Hidden when value is empty
  // or matches the export pipeline's "No Question Present" sentinel.
  const QARow = ({ label, value }) => {
    if (!value) return null;
    const trimmed = String(value).trim();
    if (!trimmed || trimmed.toLowerCase() === 'no question present') return null;
    return (
      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">
          {label}
        </div>
        <p className="text-sm text-slate-700 leading-relaxed serif">{trimmed}</p>
      </div>
    );
  };

  const CommentModal = ({ comment, category, onClose }) => {
    useModalKeybind(true, onClose);
    const themes = sortedThemes(comment.themes);
    const color = category ? category.color : '#0f172a';

    return (
      <div
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-modal flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto"
        onClick={onClose}
      >
        <div
          className="bg-white w-full max-w-4xl rounded-none sm:rounded-xl shadow-xl my-0 sm:my-6 animate-fade"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-4 flex justify-between items-start gap-4 rounded-t-xl">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
                <span className="tabular-nums">#{comment.recordId}</span>
                <span>·</span>
                <span className="truncate">{comment.commentId}</span>
              </div>
              <h2 className="serif text-lg font-semibold text-slate-900 leading-tight">
                {comment.videoTitle}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-900 text-xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 flex-shrink-0"
              aria-label="Close"
            >×</button>
          </div>

          <div className="px-6 py-5 grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">

            <aside className="space-y-4">
              <div>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">Category</div>
                {category ? (
                  <div>
                    <CategoryBadge code={category.code} name={category.name} color={category.color} size="lg" />
                    <p className="text-xs text-slate-600 mt-2 leading-relaxed">{category.description}</p>
                  </div>
                ) : (
                  <span className="text-xs text-slate-500">Unlabeled</span>
                )}
              </div>

              {comment.topic && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Topic</div>
                  <p className="text-xs text-slate-700 break-words">{comment.topic}</p>
                </div>
              )}

              {comment.subTopic && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Sub-topic</div>
                  <p className="text-xs text-slate-700 break-words">{comment.subTopic}</p>
                </div>
              )}

              {themes.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Themes</div>
                  <div className="space-y-2.5">
                    {themes.map(([name, weight]) => (
                      <ThemeBar key={name} name={name} weight={weight} color={color} />
                    ))}
                  </div>
                </div>
              )}

              <div className="border-t border-slate-100 pt-3 grid grid-cols-2 gap-2 text-[11px] text-slate-600">
                <div>
                  <div className="uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Replies</div>
                  <div className="tabular-nums">{formatNumber(comment.replyCount)}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wider text-slate-400 font-semibold mb-0.5">Chars</div>
                  <div className="tabular-nums">{formatNumber(comment.charCount)}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wider text-slate-400 font-semibold mb-0.5">RecordID</div>
                  <div className="tabular-nums">{comment.recordId}</div>
                </div>
                <div>
                  <div className="uppercase tracking-wider text-slate-400 font-semibold mb-0.5">CommentID</div>
                  <div className="text-[10px] break-all">{comment.commentId}</div>
                </div>
              </div>

              {comment.videoUrl && (
                <a
                  href={comment.videoUrl}
                  target="_blank"
                  rel="noopener"
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 transition-colors"
                >
                  Open on YouTube ↗
                </a>
              )}
            </aside>

            <div className="space-y-5">
              <section>
                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">Comment</div>
                <p className="text-sm text-slate-800 leading-relaxed serif whitespace-pre-wrap">
                  {comment.commentText}
                </p>
              </section>

              <section className="space-y-4 pt-2 border-t border-slate-100">
                <QARow label="Question excerpt" value={comment.questionExcerpt} />
                <QARow label="Question summary" value={comment.questionSummary} />
                <QARow label="Answer excerpt" value={comment.answerExcerpt} />
                <QARow label="Answer summary" value={comment.answerSummary} />
                <QARow label="Reply summary" value={comment.replySummary} />
              </section>
            </div>

          </div>
        </div>
      </div>
    );
  };

  // Top-level Raw Data tab.
  function CommentsTab({ state }) {
    const comments = state.comments || [];
    const categories = state.categories || [];

    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 200);
    const [activeCategories, setActiveCategories] = useState(() => new Set());
    const [activeThemes, setActiveThemes] = useState(() => new Set());
    const [videoFilter, setVideoFilter] = useState('');
    const [page, setPage] = useState(1);
    const [selected, setSelected] = useState(null);

    // Precomputed lookups: category map, video list, top theme list, per-category counts.
    const categoryMap = useMemo(() => {
      const m = new Map();
      for (const c of categories) m.set(c.code, c);
      return m;
    }, [categories]);

    const videoTitles = useMemo(() => {
      const set = new Set();
      for (const r of comments) if (r.videoTitle) set.add(r.videoTitle);
      return [...set].sort((a, b) => a.localeCompare(b));
    }, [comments]);

    const topThemes = useMemo(() => {
      return computeThemeFrequencies(comments).slice(0, TOP_THEME_COUNT);
    }, [comments]);

    const categoryCounts = useMemo(() => {
      const c = new Map();
      for (const r of comments) {
        const k = r.categoryCode || 'OTH';
        c.set(k, (c.get(k) || 0) + 1);
      }
      return c;
    }, [comments]);

    // Filter pipeline. Recomputes whenever any filter input changes.
    const filtered = useMemo(() => {
      const q = debouncedSearch.trim().toLowerCase();
      return comments.filter((r) => {
        if (activeCategories.size > 0 && !activeCategories.has(r.categoryCode)) return false;
        if (activeThemes.size > 0) {
          const themeKeys = r.themes ? Object.keys(r.themes) : [];
          if (!themeKeys.some((t) => activeThemes.has(t))) return false;
        }
        if (videoFilter) {
          if (videoFilter !== r.videoTitle) {
            const v = videoFilter.toLowerCase();
            if (!(r.videoTitle || '').toLowerCase().includes(v)) return false;
          }
        }
        if (q) {
          const haystack = `${r.commentText || ''} ${r.videoTitle || ''}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      });
    }, [comments, debouncedSearch, activeCategories, activeThemes, videoFilter]);

    // Reset to page 1 whenever the filtered set changes shape.
    const filteredCount = filtered.length;
    const filtersKey = `${debouncedSearch}|${[...activeCategories].sort().join(',')}|${[...activeThemes].sort().join(',')}|${videoFilter}`;
    useEffect(() => { setPage(1); }, [filtersKey]);

    const pageCount = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const pageStart = (safePage - 1) * PAGE_SIZE;
    const visible = filtered.slice(pageStart, pageStart + PAGE_SIZE);

    const toggleCategory = (code) => setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
    const toggleTheme = (name) => setActiveThemes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
    const clearAll = () => {
      setSearch('');
      setActiveCategories(new Set());
      setActiveThemes(new Set());
      setVideoFilter('');
    };

    const totalFilters = activeCategories.size + activeThemes.size +
      (videoFilter ? 1 : 0) +
      (search ? 1 : 0);

    return (
      <div className="animate-fade py-8">

        <section className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Raw data</p>
          <h2 className="serif text-3xl sm:text-4xl font-semibold text-slate-900 leading-tight">
            Browse {formatNumber(comments.length)} labeled comments
          </h2>
          <p className="text-slate-600 mt-3 max-w-2xl leading-relaxed">
            Filter by the 10-class category, search across comment text and video
            title, narrow to a specific theme or video, then click any comment
            for the full label set and Q&amp;A summaries.
          </p>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">

          <aside className="space-y-5 lg:sticky lg:top-20 lg:self-start">

            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-900">Filters</div>
              {totalFilters > 0 && (
                <button onClick={clearAll} className="text-[11px] text-slate-500 hover:text-slate-900 underline">
                  Clear all ({totalFilters})
                </button>
              )}
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">Category</div>
              <div className="flex flex-wrap gap-1.5">
                {categories.map((c) => (
                  <Chip
                    key={c.code}
                    active={activeCategories.has(c.code)}
                    onClick={() => toggleCategory(c.code)}
                    count={categoryCounts.get(c.code) || 0}
                  >
                    {c.code}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
                Top {TOP_THEME_COUNT} themes
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-64 overflow-y-auto scrollbar-thin pr-1">
                {topThemes.map(([name, count]) => (
                  <Chip
                    key={name}
                    active={activeThemes.has(name)}
                    onClick={() => toggleTheme(name)}
                    count={count}
                  >
                    {name}
                  </Chip>
                ))}
              </div>
            </div>

            <div>
              <label htmlFor="video-filter" className="block text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
                Video
              </label>
              <input
                id="video-filter"
                list="video-options"
                type="text"
                value={videoFilter}
                onChange={(e) => setVideoFilter(e.target.value)}
                placeholder={`Type to filter ${videoTitles.length} videos…`}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-md focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900"
              />
              <datalist id="video-options">
                {videoTitles.map((v) => <option key={v} value={v} />)}
              </datalist>
              {videoFilter && (
                <button
                  onClick={() => setVideoFilter('')}
                  className="mt-1 text-[11px] text-slate-500 hover:text-slate-900 underline"
                >
                  Clear video
                </button>
              )}
            </div>

          </aside>

          <section>

            <div className="relative mb-4">
              <input
                type="text"
                placeholder="Search comment text or video title…"
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

            <div className="text-xs text-slate-500 mb-4">
              Showing <span className="font-medium text-slate-900 tabular-nums">{formatNumber(filteredCount)}</span> of {formatNumber(comments.length)} comments
              {pageCount > 1 && (
                <span> · page <span className="tabular-nums">{safePage}</span> of <span className="tabular-nums">{pageCount}</span></span>
              )}
            </div>

            {filteredCount === 0 ? (
              <div className="text-center py-16 text-slate-500 border border-slate-200 rounded-lg bg-white">
                <p className="text-sm">No comments match the current filters.</p>
                <button onClick={clearAll} className="text-xs text-slate-700 underline mt-2">Reset filters</button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {visible.map((c) => (
                    <CommentCard
                      key={c.recordId}
                      comment={c}
                      category={categoryByCode(categories, c.categoryCode)}
                      onClick={() => setSelected(c)}
                    />
                  ))}
                </div>

                {pageCount > 1 && (
                  <div className="flex items-center justify-between mt-6 text-xs text-slate-600">
                    <button
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="px-3 py-1.5 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Prev
                    </button>
                    <span className="tabular-nums">
                      Page {safePage} / {pageCount}
                    </span>
                    <button
                      disabled={safePage >= pageCount}
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      className="px-3 py-1.5 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                  </div>
                )}
              </>
            )}

          </section>
        </div>

        {selected && (
          <CommentModal
            comment={selected}
            category={categoryByCode(categories, selected.categoryCode)}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    );
  }

  return { CommentsTab };
})();

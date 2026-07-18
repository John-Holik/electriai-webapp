/* Videos & Comments tab. Browses the YouTube dataset restricted to videos and
   comments that survived the GPT classification pipeline (i.e. those
   present in Final_Analysis.csv, surfaced via data/raw_videos.json).
   Default view is a grid of video cards topped by a dataset stat strip;
   clicking a card drills into that video's full comment thread, and
   clicking a comment expands its full text and metadata inline. */

window.AppRawData = (function() {
  const { useState, useEffect, useMemo, useRef } = React;
  const { formatNumber, formatCompact } = window.AppUtils;

  const PAGE_SIZE = 24;
  const COMMENT_SNIPPET_CHARS = 240;

  // Tiny debounce for the search box so we do not refilter every keystroke.
  const useDebouncedValue = (value, ms) => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
      const id = setTimeout(() => setDebounced(value), ms);
      return () => clearTimeout(id);
    }, [value, ms]);
    return debounced;
  };

  // Group flat comment array by parentId so reply threading renders together.
  const groupReplies = (comments) => {
    const topLevel = [];
    const repliesByParent = new Map();
    for (const c of comments) {
      if (c.parentId == null) {
        topLevel.push(c);
      } else {
        if (!repliesByParent.has(c.parentId)) repliesByParent.set(c.parentId, []);
        repliesByParent.get(c.parentId).push(c);
      }
    }
    return { topLevel, repliesByParent };
  };

  // Roll a comment list up into per-video engagement stats: thread count
  // (top-level comments), reply count, total likes, first/last activity
  // dates, and the id of the single most-liked top-level comment.
  const computeStats = (comments = []) => {
    let threads = 0, replies = 0, likes = 0, first = null, last = null, top = null;
    for (const c of comments) {
      if (c.parentId == null) threads++; else replies++;
      likes += c.likes || 0;
      const p = c.publishedAt;
      if (p) {
        if (!first || p < first) first = p;
        if (!last || p > last) last = p;
      }
      if (c.parentId == null && (!top || (c.likes || 0) > (top.likes || 0))) top = c;
    }
    return { threads, replies, likes, first, last, topId: top ? top.commentId : null };
  };

  // Date helpers. publishedAt is an ISO string; ISO strings sort lexically.
  const monthYear = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  const formatDateRange = (first, last) => {
    if (!first) return '';
    const a = monthYear(first), b = monthYear(last);
    return a === b ? a : `${a} – ${b}`;
  };
  const yearRange = (first, last) => {
    if (!first) return '—';
    const a = String(first).slice(0, 4), b = String(last).slice(0, 4);
    return a === b ? a : `${a}–${b}`;
  };

  // Null-safe compact number: shows an em-dash placeholder when a video's
  // view/like count was hidden or unavailable at collection time.
  const compact = (n) => (n == null ? '—' : formatCompact(n));

  // Small stroke-icon set (no icon library is loaded, so these are inline SVG).
  const IC = {
    comment: <path d="M4 5h16v11H8l-4 4V5z" />,
    threads: <path d="M4 6h16M4 12h12M4 18h8" />,
    heart: <path d="M12 20s-6.5-4.2-9-8C1.5 9 3 6 6 6c1.9 0 3.1 1.1 4 2.2C10.9 7.1 12.1 6 14 6c3 0 4.5 3 3 6-2.5 3.8-9 8-9 8z" />,
    reply: <path d="M9 13L4 8l5-5M4 8h9a7 7 0 017 7v2" />,
    calendar: <path d="M7 3v3M17 3v3M4 8h16M5 5h14v14H5z" />,
    clock: <React.Fragment><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></React.Fragment>,
    video: <path d="M3 6h12v12H3zM15 10l6-3v10l-6-3" />,
    eye: <React.Fragment><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></React.Fragment>,
  };
  const Ico = ({ name, cls = 'w-3.5 h-3.5' }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
         strokeLinecap="round" strokeLinejoin="round" className={cls}>
      {IC[name]}
    </svg>
  );

  // Inline stat chip (icon + value) used on cards and comment metadata.
  const StatChip = ({ icon, children, title }) => (
    <span title={title} className="inline-flex items-center gap-1 text-[11px]">
      <Ico name={icon} cls="w-3.5 h-3.5 text-slate-400" />
      <span className="tabular-nums text-slate-600">{children}</span>
    </span>
  );

  // YouTube thumbnail with a graceful gradient fallback if the image 404s.
  const Thumb = ({ videoId, quality = 'mqdefault', alt, children }) => {
    const [err, setErr] = useState(false);
    return (
      <div className="relative w-full aspect-video overflow-hidden bg-slate-100">
        {err ? (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-200 to-slate-100 text-slate-400">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-10 h-10"><path d="M8 5v14l11-7z" /></svg>
          </div>
        ) : (
          <img
            src={`https://i.ytimg.com/vi/${videoId}/${quality}.jpg`}
            alt={alt || ''}
            loading="lazy"
            onError={() => setErr(true)}
            className="rd-thumb w-full h-full object-cover"
          />
        )}
        {children}
      </div>
    );
  };

  // Colored initial-avatar for comment authors; hue is stable per author.
  const AVATAR_PALETTE = [
    'bg-slate-200 text-slate-700', 'bg-sky-100 text-sky-700',
    'bg-amber-100 text-amber-700', 'bg-emerald-100 text-emerald-700',
    'bg-violet-100 text-violet-700', 'bg-rose-100 text-rose-700',
  ];
  const Avatar = ({ name }) => {
    const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
    let h = 0;
    for (const ch of (name || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const cls = AVATAR_PALETTE[h % AVATAR_PALETTE.length];
    return (
      <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${cls}`}>
        {initial}
      </span>
    );
  };

  // Dataset stat card in the strip above the video grid.
  const StatCard = ({ icon, value, label, accent, title }) => (
    <div title={title} className="relative bg-white border border-slate-200 rounded-lg p-4 overflow-hidden">
      <span className={`absolute left-0 top-0 h-full w-1 ${accent}`}></span>
      <div className="flex items-center gap-2 mb-2 text-slate-400">
        <Ico name={icon} cls="w-4 h-4" />
        <span className="text-[10px] uppercase tracking-[0.15em] font-semibold text-slate-500">{label}</span>
      </div>
      <div className="serif text-2xl font-semibold text-slate-900 tabular-nums leading-none">{value}</div>
    </div>
  );

  // Tile in the default video grid.
  const VideoCard = ({ video, stats, rank, onClick }) => (
    <article
      onClick={onClick}
      className="rd-card group bg-white border border-slate-200 rounded-lg overflow-hidden hover:border-slate-300 cursor-pointer animate-fade flex flex-col"
    >
      <Thumb videoId={video.videoId} alt={video.title || video.videoId}>
        <span className="absolute top-2 left-2 px-1.5 py-0.5 rounded-md bg-slate-900/80 text-white text-[10px] font-semibold tabular-nums backdrop-blur-modal">
          #{rank}
        </span>
        {video.transcript && (
          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-md bg-white/85 text-slate-700 text-[10px] font-medium backdrop-blur-modal">
            Transcript
          </span>
        )}
        <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-900/80 text-white text-[10px] font-medium tabular-nums backdrop-blur-modal">
          <Ico name="comment" cls="w-3 h-3" />
          {formatNumber(video.commentCount)}
        </span>
      </Thumb>

      <div className="p-4 flex flex-col flex-1">
        <h3 title={video.title || video.videoId}
            className="serif text-base font-semibold text-slate-900 leading-snug line-clamp-2 mb-3 min-h-[2.6em]">
          {video.title || video.videoId}
        </h3>

        <div className="flex items-center gap-4 flex-wrap mb-3">
          {video.views != null && (
            <StatChip icon="eye" title="video views">{formatCompact(video.views)}</StatChip>
          )}
          {video.likes != null && (
            <StatChip icon="heart" title="video likes">{formatCompact(video.likes)}</StatChip>
          )}
          <StatChip icon="threads" title="comment threads">{formatNumber(stats.threads)} threads</StatChip>
        </div>

        <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 text-[11px] text-slate-400" title={formatDateRange(stats.first, stats.last)}>
            <Ico name="calendar" cls="w-3.5 h-3.5" />
            {formatDateRange(stats.first, stats.last) || 'No dates'}
          </span>
          <a
            href={video.url}
            target="_blank"
            rel="noopener"
            onClick={(e) => e.stopPropagation()}
            className="text-[11px] text-slate-500 hover:text-slate-900 underline underline-offset-2 flex-shrink-0"
          >
            YouTube ↗
          </a>
        </div>
      </div>
    </article>
  );

  // Single comment row inside the drilled-in video detail view.
  // `focused` is set when this comment is the one the chat panel asked
  // us to scroll to; in that case it auto-expands and shows a highlight.
  // `isTop` flags the most-liked top-level comment on the video.
  const CommentRow = ({ comment, isReply, focused, scrollRef, isTop }) => {
    const [expanded, setExpanded] = useState(focused || false);
    const text = comment.text || '';
    const needsTruncate = text.length > COMMENT_SNIPPET_CHARS;
    const shown = expanded || !needsTruncate
      ? text
      : text.slice(0, COMMENT_SNIPPET_CHARS).trimEnd() + '…';

    return (
      <div
        ref={scrollRef}
        className={`bg-white border rounded-md p-4 hover:border-slate-400 transition-colors cursor-pointer ${isReply ? 'ml-6 border-l-2 border-l-slate-300' : ''} ${focused ? 'border-amber-400 ring-2 ring-amber-200 bg-amber-50' : 'border-slate-200'}`}
        onClick={() => needsTruncate && setExpanded((v) => !v)}
      >
        <div className="flex items-start gap-3">
          <Avatar name={comment.author} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3 mb-1">
              <div className="flex items-center gap-2 min-w-0 text-[11px] text-slate-500">
                {isReply && (
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Reply</span>
                )}
                <span className="font-medium text-slate-700 truncate">{comment.author || 'Anonymous'}</span>
                {comment.publishedAt && (
                  <span className="text-slate-400 whitespace-nowrap">· {comment.publishedAt.slice(0, 10)}</span>
                )}
                {isTop && (
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 text-[10px] font-semibold border border-amber-200 whitespace-nowrap">
                    Top comment
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 text-[11px]">
                {comment.likes > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 tabular-nums">
                    <Ico name="heart" cls="w-3 h-3 text-slate-400" />{formatNumber(comment.likes)}
                  </span>
                )}
                {!isReply && comment.replyCount > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 tabular-nums">
                    <Ico name="reply" cls="w-3 h-3 text-slate-400" />{formatNumber(comment.replyCount)}
                  </span>
                )}
              </div>
            </div>
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap serif">
              {shown}
            </p>
            {needsTruncate && (
              <button
                onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
                className="mt-2 text-[11px] text-slate-500 underline hover:text-slate-900"
              >
                {expanded ? 'show less' : 'show more'}
              </button>
            )}
          </div>
        </div>
      </div>
    );
  };

  // Collapsible transcript panel shown at the top of the video detail view.
  const TranscriptPanel = ({ text }) => {
    const [open, setOpen] = useState(false);
    const words = text.trim().split(/\s+/).filter(Boolean).length;
    const mins = Math.max(1, Math.round(words / 200));
    return (
      <section className="bg-slate-50 border border-slate-200 rounded-lg mb-5 overflow-hidden">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-slate-100 transition-colors"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <Ico name="clock" cls="w-4 h-4 text-slate-400" />
            Transcript
            <span className="text-xs font-normal text-slate-500">
              · {formatNumber(words)} words · {mins} min read
            </span>
          </span>
          <span className="text-slate-400 text-lg leading-none">{open ? '−' : '+'}</span>
        </button>
        {open && (
          <div className="px-5 pb-5">
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto scrollbar-thin pr-2">
              {text}
            </p>
          </div>
        )}
      </section>
    );
  };

  const COMMENT_SORTS = [
    { id: 'top', label: 'Top' },
    { id: 'newest', label: 'Newest' },
    { id: 'replies', label: 'Most replies' },
  ];

  // Drill-in view: a single video + all its comments, threaded by parentId.
  // `focusCommentId` (optional) is the commentId the chat tab asked us to
  // scroll to and highlight after navigating in.
  const VideoDetail = ({ video, onBack, focusCommentId }) => {
    const { topLevel, repliesByParent } = useMemo(() => groupReplies(video.comments || []), [video]);
    const stats = useMemo(() => computeStats(video.comments || []), [video]);
    const [search, setSearch] = useState('');
    const [sort, setSort] = useState('top');
    const debouncedSearch = useDebouncedValue(search, 200);
    const focusRef = useRef(null);

    // Scroll the focused comment into view once it has rendered.
    useEffect(() => {
      if (!focusCommentId) return;
      const id = window.requestAnimationFrame(() => {
        if (focusRef.current) {
          focusRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
      return () => window.cancelAnimationFrame(id);
    }, [focusCommentId, video.videoId]);

    // Filter threads by the search box, then order by the chosen sort.
    const filteredTop = useMemo(() => {
      const q = debouncedSearch.trim().toLowerCase();
      let rows = topLevel;
      if (q) {
        rows = topLevel.filter((c) => {
          if ((c.text || '').toLowerCase().includes(q)) return true;
          if ((c.author || '').toLowerCase().includes(q)) return true;
          const replies = repliesByParent.get(c.commentId) || [];
          return replies.some((r) =>
            (r.text || '').toLowerCase().includes(q) || (r.author || '').toLowerCase().includes(q)
          );
        });
      }
      const ordered = rows.slice();
      if (sort === 'top') ordered.sort((a, b) => (b.likes || 0) - (a.likes || 0));
      else if (sort === 'newest') ordered.sort((a, b) => String(b.publishedAt || '').localeCompare(String(a.publishedAt || '')));
      else if (sort === 'replies') ordered.sort((a, b) => (b.replyCount || 0) - (a.replyCount || 0));
      return ordered;
    }, [topLevel, repliesByParent, debouncedSearch, sort]);

    const metrics = [
      { value: compact(video.views), label: 'views' },
      { value: compact(video.likes), label: 'likes' },
      { value: formatNumber(video.commentCount), label: 'comments' },
      { value: formatNumber(stats.threads), label: 'threads' },
      { value: formatNumber(stats.replies), label: 'replies' },
      { value: formatDateRange(stats.first, stats.last) || '—', label: 'active' },
    ];

    return (
      <div className="animate-fade">
        <button
          onClick={onBack}
          className="text-xs text-slate-600 hover:text-slate-900 underline mb-4"
        >
          ← Back to all videos
        </button>

        <section className="bg-white border border-slate-200 rounded-lg overflow-hidden mb-5">
          <div className="grid sm:grid-cols-[16rem_1fr]">
            <div className="sm:border-r border-slate-200">
              <Thumb videoId={video.videoId} quality="hqdefault" alt={video.title || video.videoId} />
            </div>
            <div className="p-5 flex flex-col">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">YouTube video</p>
              <h2 className="serif text-xl sm:text-2xl font-semibold text-slate-900 leading-tight">
                {video.title || video.videoId}
              </h2>
              <p className="text-xs text-slate-400 mt-1 tabular-nums">{video.videoId}</p>

              <div className="flex flex-wrap gap-x-6 gap-y-3 mt-4">
                {metrics.map((m) => (
                  <div key={m.label}>
                    <div className="serif text-lg font-semibold text-slate-900 tabular-nums leading-none">{m.value}</div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">{m.label}</div>
                  </div>
                ))}
              </div>

              <a
                href={video.url}
                target="_blank"
                rel="noopener"
                className="inline-flex items-center gap-1.5 px-3 py-2 mt-5 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 transition-colors self-start"
              >
                Open on YouTube ↗
              </a>
            </div>
          </div>
        </section>

        {video.transcript && <TranscriptPanel text={video.transcript} />}

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search this video's comments or authors…"
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
          <div className="flex items-center gap-1 flex-wrap">
            {COMMENT_SORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors ${sort === s.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-500 mb-3">
          Showing <span className="font-medium text-slate-900 tabular-nums">{formatNumber(filteredTop.length)}</span> of {formatNumber(topLevel.length)} threads
        </div>

        {filteredTop.length === 0 ? (
          <div className="text-center py-12 text-slate-500 border border-slate-200 rounded-lg bg-white">
            <p className="text-sm">No comments match the search.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredTop.map((c) => (
              <div key={c.commentId} className="space-y-2">
                <CommentRow
                  comment={c}
                  isReply={false}
                  isTop={c.commentId === stats.topId}
                  focused={focusCommentId === c.commentId}
                  scrollRef={focusCommentId === c.commentId ? focusRef : null}
                />
                {(repliesByParent.get(c.commentId) || []).map((r) => (
                  <CommentRow
                    key={r.commentId}
                    comment={r}
                    isReply={true}
                    focused={focusCommentId === r.commentId}
                    scrollRef={focusCommentId === r.commentId ? focusRef : null}
                  />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const VIDEO_SORTS = [
    { id: 'comments', label: 'Most comments' },
    { id: 'likes', label: 'Most likes' },
    { id: 'recent', label: 'Newest' },
    { id: 'title', label: 'A–Z' },
  ];

  // Top-level Videos & Comments tab.
  function RawDataTab({ state, loading, navIntent, clearNavIntent }) {
    const doc = state.rawVideos;
    const videos = doc ? doc.videos : [];
    const meta = doc ? doc.meta : null;

    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 200);
    const [page, setPage] = useState(1);
    const [sort, setSort] = useState('comments');
    const [selectedVideoId, setSelectedVideoId] = useState(null);
    const [focusCommentId, setFocusCommentId] = useState(null);

    // One pass over every comment to precompute per-video engagement stats.
    // Memoized on `videos`, so it only runs once after the dataset loads.
    const statsByVideo = useMemo(() => {
      const map = new Map();
      for (const v of videos) map.set(v.videoId, computeStats(v.comments || []));
      return map;
    }, [videos]);

    // Earliest/latest comment date across the dataset, for the active-span card.
    const activeSpan = useMemo(() => {
      let first = null, last = null;
      for (const s of statsByVideo.values()) {
        if (s.first && (!first || s.first < first)) first = s.first;
        if (s.last && (!last || s.last > last)) last = s.last;
      }
      return { first, last };
    }, [statsByVideo]);

    // Consume a cross-tab nav intent (e.g. the chat tab asked us to open
    // a specific video and scroll to a specific cited comment). Waits
    // until the raw videos dataset has actually loaded before acting.
    useEffect(() => {
      if (!navIntent || !navIntent.videoId) return;
      if (!videos || videos.length === 0) return;
      setSelectedVideoId(navIntent.videoId);
      setFocusCommentId(navIntent.commentId || null);
      clearNavIntent && clearNavIntent();
    }, [navIntent, videos]);

    const filtered = useMemo(() => {
      const q = debouncedSearch.trim().toLowerCase();
      if (!q) return videos;
      return videos.filter((v) => {
        if ((v.title || '').toLowerCase().includes(q)) return true;
        if ((v.videoId || '').toLowerCase().includes(q)) return true;
        return (v.comments || []).some((c) =>
          (c.text || '').toLowerCase().includes(q) || (c.author || '').toLowerCase().includes(q)
        );
      });
    }, [videos, debouncedSearch]);

    // Apply the chosen ordering. `videos` already arrives sorted by comment
    // count, so 'comments' is a cheap no-op copy.
    const sorted = useMemo(() => {
      const arr = filtered.slice();
      const likesOf = (v) => (statsByVideo.get(v.videoId) || {}).likes || 0;
      const lastOf = (v) => (statsByVideo.get(v.videoId) || {}).last || '';
      if (sort === 'comments') arr.sort((a, b) => b.commentCount - a.commentCount);
      else if (sort === 'likes') arr.sort((a, b) => likesOf(b) - likesOf(a));
      else if (sort === 'recent') arr.sort((a, b) => String(lastOf(b)).localeCompare(String(lastOf(a))));
      else if (sort === 'title') arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      return arr;
    }, [filtered, sort, statsByVideo]);

    useEffect(() => { setPage(1); }, [debouncedSearch, sort]);

    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const pageStart = (safePage - 1) * PAGE_SIZE;
    const visible = sorted.slice(pageStart, pageStart + PAGE_SIZE);

    const selectedVideo = useMemo(
      () => videos.find((v) => v.videoId === selectedVideoId) || null,
      [videos, selectedVideoId]
    );

    if (loading || !doc) {
      return (
        <div className="py-16 text-center">
          <div className="inline-block w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mb-3"></div>
          <p className="text-sm text-slate-500">Loading video dataset…</p>
        </div>
      );
    }

    if (selectedVideo) {
      return (
        <div className="py-8">
          <VideoDetail
            video={selectedVideo}
            focusCommentId={focusCommentId}
            onBack={() => { setSelectedVideoId(null); setFocusCommentId(null); }}
          />
        </div>
      );
    }

    return (
      <div className="animate-fade py-8">

        <section className="rd-hero-glow border border-slate-200 rounded-xl p-6 sm:p-8 mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Videos &amp; Comments</p>
          <h2 className="serif text-3xl sm:text-4xl font-semibold text-slate-900 leading-tight">
            Browse {formatNumber(meta.totalVideos)} videos &amp; {formatNumber(meta.totalComments)} comments
          </h2>
          <p className="text-slate-600 mt-3 max-w-2xl leading-relaxed">
            Every YouTube video and comment that made it through the GPT
            classification pipeline. Click a video to open its full thread and
            transcript, then click any comment to expand the full text.
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-6">
            <StatCard icon="video" label="Videos" accent="bg-sky-400"
                      value={formatCompact(meta.totalVideos)} title={`${formatNumber(meta.totalVideos)} videos`} />
            <StatCard icon="eye" label="Views" accent="bg-violet-400"
                      value={compact(meta.totalViews)} title={`${formatNumber(meta.totalViews)} total views`} />
            <StatCard icon="heart" label="Video likes" accent="bg-rose-400"
                      value={compact(meta.totalLikes)} title={`${formatNumber(meta.totalLikes)} total video likes`} />
            <StatCard icon="comment" label="Comments" accent="bg-slate-400"
                      value={formatCompact(meta.totalComments)} title={`${formatNumber(meta.totalComments)} comments`} />
            <StatCard icon="calendar" label="Active span" accent="bg-amber-400"
                      value={yearRange(activeSpan.first, activeSpan.last)} title={formatDateRange(activeSpan.first, activeSpan.last)} />
          </div>
        </section>

        <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search video titles, authors, or comment text…"
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
          <div className="flex items-center gap-1 flex-wrap">
            {VIDEO_SORTS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors ${sort === s.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-500 mb-4">
          Showing <span className="font-medium text-slate-900 tabular-nums">{formatNumber(sorted.length)}</span> of {formatNumber(videos.length)} videos
          {pageCount > 1 && (
            <span> · page <span className="tabular-nums">{safePage}</span> of <span className="tabular-nums">{pageCount}</span></span>
          )}
        </div>

        {sorted.length === 0 ? (
          <div className="text-center py-16 text-slate-500 border border-slate-200 rounded-lg bg-white">
            <p className="text-sm">No videos match the current search.</p>
            <button onClick={() => setSearch('')} className="text-xs text-slate-700 underline mt-2">Reset search</button>
          </div>
        ) : (
          <React.Fragment>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((v, i) => (
                <VideoCard
                  key={v.videoId}
                  video={v}
                  stats={statsByVideo.get(v.videoId) || { threads: 0, likes: 0, first: null, last: null }}
                  rank={pageStart + i + 1}
                  onClick={() => setSelectedVideoId(v.videoId)}
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
                <span className="tabular-nums">Page {safePage} / {pageCount}</span>
                <button
                  disabled={safePage >= pageCount}
                  onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                  className="px-3 py-1.5 border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Next →
                </button>
              </div>
            )}
          </React.Fragment>
        )}

      </div>
    );
  }

  return { RawDataTab };
})();

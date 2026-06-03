/* Raw Data tab. Browses the YouTube corpus restricted to videos and
   comments that survived the GPT classification pipeline (i.e. those
   present in Final_Analysis.csv, surfaced via data/raw_videos.json).
   Default view is a grid of video cards; clicking a card drills into
   that video's full comment list, and clicking a comment expands its
   full text and metadata inline. */

window.AppRawData = (function() {
  const { useState, useEffect, useMemo, useRef } = React;
  const { formatNumber } = window.AppUtils;

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

  // Tile in the default video grid.
  const VideoCard = ({ video, onClick }) => (
    <article
      onClick={onClick}
      className="bg-white border border-slate-200 rounded-lg p-5 hover:border-slate-400 hover:shadow-sm transition-all cursor-pointer animate-fade flex flex-col"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
          YouTube video
        </span>
        <span className="text-[11px] text-slate-500 tabular-nums">
          {formatNumber(video.commentCount)} {video.commentCount === 1 ? 'comment' : 'comments'}
        </span>
      </div>
      <h3 className="serif text-base font-semibold text-slate-900 leading-snug line-clamp-3 mb-3 flex-1">
        {video.title || video.videoId}
      </h3>
      <a
        href={video.url}
        target="_blank"
        rel="noopener"
        onClick={(e) => e.stopPropagation()}
        className="text-[11px] text-slate-500 hover:text-slate-900 underline underline-offset-2"
      >
        Open on YouTube ↗
      </a>
    </article>
  );

  // Single comment row inside the drilled-in video detail view.
  // `focused` is set when this comment is the one the chat panel asked
  // us to scroll to; in that case it auto-expands and shows a highlight.
  const CommentRow = ({ comment, isReply, focused, scrollRef }) => {
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
        <div className="flex items-center justify-between gap-3 text-[11px] text-slate-500 mb-2">
          <div className="flex items-center gap-2 min-w-0">
            {isReply && (
              <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">Reply</span>
            )}
            <span className="font-medium text-slate-700 truncate">{comment.author || 'Anonymous'}</span>
            {comment.publishedAt && (
              <span className="text-slate-400">· {comment.publishedAt.slice(0, 10)}</span>
            )}
          </div>
          <div className="flex items-center gap-3 flex-shrink-0">
            {comment.likes > 0 && (
              <span className="tabular-nums">{formatNumber(comment.likes)} ♥</span>
            )}
            {!isReply && comment.replyCount > 0 && (
              <span className="tabular-nums">{formatNumber(comment.replyCount)} replies</span>
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
        <div className="mt-2 text-[10px] text-slate-400 break-all">
          {comment.commentId}
        </div>
      </div>
    );
  };

  // Drill-in view: a single video + all its comments, threaded by parentId.
  // `focusCommentId` (optional) is the commentId the chat tab asked us to
  // scroll to and highlight after navigating in.
  const VideoDetail = ({ video, onBack, focusCommentId }) => {
    const { topLevel, repliesByParent } = useMemo(() => groupReplies(video.comments || []), [video]);
    const [search, setSearch] = useState('');
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

    const filteredTop = useMemo(() => {
      const q = debouncedSearch.trim().toLowerCase();
      if (!q) return topLevel;
      return topLevel.filter((c) => {
        if ((c.text || '').toLowerCase().includes(q)) return true;
        if ((c.author || '').toLowerCase().includes(q)) return true;
        const replies = repliesByParent.get(c.commentId) || [];
        return replies.some((r) =>
          (r.text || '').toLowerCase().includes(q) || (r.author || '').toLowerCase().includes(q)
        );
      });
    }, [topLevel, repliesByParent, debouncedSearch]);

    return (
      <div className="animate-fade">
        <button
          onClick={onBack}
          className="text-xs text-slate-600 hover:text-slate-900 underline mb-4"
        >
          ← Back to all videos
        </button>

        <section className="bg-slate-50 border border-slate-200 rounded-lg p-5 mb-5">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">YouTube video</p>
              <h2 className="serif text-xl sm:text-2xl font-semibold text-slate-900 leading-tight">
                {video.title || video.videoId}
              </h2>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {formatNumber(video.commentCount)} labeled comments · {video.videoId}
              </p>
            </div>
            <a
              href={video.url}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-900 text-white text-xs font-medium rounded-md hover:bg-slate-800 transition-colors flex-shrink-0"
            >
              Open on YouTube ↗
            </a>
          </div>
        </section>

        <div className="relative mb-4">
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

  // Top-level Raw Data tab.
  function RawDataTab({ state, loading }) {
    const doc = state.rawVideos;
    const videos = doc ? doc.videos : [];
    const meta = doc ? doc.meta : null;

    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search, 200);
    const [page, setPage] = useState(1);
    const [selectedVideoId, setSelectedVideoId] = useState(null);

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

    useEffect(() => { setPage(1); }, [debouncedSearch]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    const safePage = Math.min(page, pageCount);
    const pageStart = (safePage - 1) * PAGE_SIZE;
    const visible = filtered.slice(pageStart, pageStart + PAGE_SIZE);

    const selectedVideo = useMemo(
      () => videos.find((v) => v.videoId === selectedVideoId) || null,
      [videos, selectedVideoId]
    );

    if (loading || !doc) {
      return (
        <div className="py-16 text-center">
          <div className="inline-block w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mb-3"></div>
          <p className="text-sm text-slate-500">Loading raw video corpus…</p>
        </div>
      );
    }

    if (selectedVideo) {
      return (
        <div className="py-8">
          <VideoDetail video={selectedVideo} onBack={() => setSelectedVideoId(null)} />
        </div>
      );
    }

    return (
      <div className="animate-fade py-8">

        <section className="mb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Raw data</p>
          <h2 className="serif text-3xl sm:text-4xl font-semibold text-slate-900 leading-tight">
            Browse {formatNumber(meta.totalVideos)} videos · {formatNumber(meta.totalComments)} comments
          </h2>
          <p className="text-slate-600 mt-3 max-w-2xl leading-relaxed">
            Every YouTube video and comment that made it through the GPT
            classification pipeline. Click a video to open its full thread,
            then click any comment to expand the full text.
          </p>
        </section>

        <div className="relative mb-4">
          <input
            type="text"
            placeholder="Search video titles"
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
          Showing <span className="font-medium text-slate-900 tabular-nums">{formatNumber(filtered.length)}</span> of {formatNumber(videos.length)} videos
          {pageCount > 1 && (
            <span> · page <span className="tabular-nums">{safePage}</span> of <span className="tabular-nums">{pageCount}</span></span>
          )}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-500 border border-slate-200 rounded-lg bg-white">
            <p className="text-sm">No videos match the current search.</p>
            <button onClick={() => setSearch('')} className="text-xs text-slate-700 underline mt-2">Reset search</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {visible.map((v) => (
                <VideoCard
                  key={v.videoId}
                  video={v}
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
          </>
        )}

      </div>
    );
  }

  return { RawDataTab };
})();

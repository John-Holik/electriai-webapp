/* Ask ElectriAI tab. Retrieves the most relevant chunks from
   wiki_embeddings.json + wiki_chunks.json for a user question, then
   asks Gemini to answer using only those chunks. Citations to videos
   are rendered as clickable YouTube links; comment citations are shown
   as inline pills (YouTube has no reliable comment deep-link).

   Local-dev wiring: this version calls the Gemini API directly from
   the browser using a localhost-only dev key (set via
   `localStorage.setItem('GEMINI_DEV_KEY', '...')`). The plan's Phase 3
   Cloudflare Worker proxy is deferred; swapping to the proxy at deploy
   time is a two-URL change in this file. */

window.AppChat = (function() {
  const { useState, useEffect, useMemo, useRef } = React;
  const { WikiPageModal } = window.AppComponents;

  const GEMINI_EMBED_URL    = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
  const GEMINI_GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent';

  const TOP_K        = 6;   // total chunks retrieved
  const FULL_K       = 3;   // top chunks rendered in full into the prompt
  const COMPACT_CHARS = 320; // size of "compact" chunks (the next 3)
  const FURTHER_K    = 3;   // wiki pages surfaced in the "Further reading" footer

  // ─── Vector math ────────────────────────────────────────
  // Standard cosine similarity for two equal-length numeric arrays.
  const cosineSimilarity = (a, b) => {
    let dot = 0, normA = 0, normB = 0;
    const n = a.length;
    for (let i = 0; i < n; i++) {
      const x = a[i], y = b[i];
      dot += x * y;
      normA += x * x;
      normB += y * y;
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  // ─── Gemini API calls ──────────────────────────────────
  // Embeds the user query and returns the 768-d vector.
  const embedQuery = async (apiKey, text, workerBase) => {
    const url = workerBase
      ? `${workerBase}/api/embed`
      : `${GEMINI_EMBED_URL}?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType: 'RETRIEVAL_QUERY',
        outputDimensionality: 768,
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`embed (${res.status}): ${errText.slice(0, 240)}`);
    }
    const data = await res.json();
    return data?.embedding?.values || data?.embeddings?.[0]?.values;
  };

  // Streams a Gemini generation response, calling onDelta with each
  // accumulated text snippet. Uses the SSE variant for line-by-line parsing.
  const streamGenerate = async (apiKey, systemText, userText, onDelta, workerBase) => {
    // The Worker proxy handles `?alt=sse` server-side and streams the body
    // straight through, so the browser never sees the key.
    const url = workerBase
      ? `${workerBase}/api/generate`
      : `${GEMINI_GENERATE_URL}?alt=sse&key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemText }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 2048,
          // 2.5 flash enables hidden "thinking" by default which eats the
          // token budget before any visible text streams out. Force it off.
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`generate (${res.status}): ${errText.slice(0, 240)}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let rawBody = '';
    let full = '';
    let lastFinishReason = null;
    let lastPromptFeedback = null;
    let sseEventCount = 0;

    // Drains any complete events at the head of `buffer`. SSE events are
    // separated by a blank line; we tolerate both LF and CRLF endings.
    const drainEvents = () => {
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop();
      for (const ev of events) {
        const line = ev.split(/\r?\n/).find((l) => l.startsWith('data:'));
        if (!line) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        sseEventCount++;
        try {
          const json = JSON.parse(payload);
          const cand = json?.candidates?.[0];
          const parts = cand?.content?.parts || [];
          for (const p of parts) {
            if (p.text) {
              full += p.text;
              onDelta(full);
            }
          }
          if (cand?.finishReason) lastFinishReason = cand.finishReason;
          if (json?.promptFeedback) lastPromptFeedback = json.promptFeedback;
        } catch (e) { /* ignore malformed partials */ }
      }
    };

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const decoded = decoder.decode(value, { stream: true });
      rawBody += decoded;
      buffer += decoded;
      drainEvents();
    }
    // Some servers omit the trailing blank line, leaving one final event
    // stuck in the buffer. Force a drain by appending a separator.
    if (buffer.trim()) {
      buffer += '\n\n';
      drainEvents();
    }

    // Fallback: if SSE parsing produced zero events, the body may have come
    // back as a single JSON document (the non-SSE shape). Walk it directly.
    if (sseEventCount === 0 && rawBody.trim()) {
      try {
        const parsed = JSON.parse(rawBody);
        const arr = Array.isArray(parsed) ? parsed : [parsed];
        for (const json of arr) {
          const cand = json?.candidates?.[0];
          const parts = cand?.content?.parts || [];
          for (const p of parts) {
            if (p.text) {
              full += p.text;
              onDelta(full);
            }
          }
          if (cand?.finishReason) lastFinishReason = cand.finishReason;
          if (json?.promptFeedback) lastPromptFeedback = json.promptFeedback;
        }
      } catch (e) { /* not JSON either, caller will see empty text */ }
    }
    return { text: full, finishReason: lastFinishReason, promptFeedback: lastPromptFeedback };
  };

  // ─── Retrieval ──────────────────────────────────────────
  // Returns the top-K (chunkKey, score, chunk) triples for a query vector.
  const retrieveTopChunks = (queryVector, embeddings, chunks, k) => {
    const scored = [];
    for (const key in embeddings) {
      const vec = embeddings[key];
      if (!vec || vec.length !== queryVector.length) continue;
      const chunk = chunks[key];
      if (!chunk) continue;
      scored.push({ key, score: cosineSimilarity(queryVector, vec), chunk });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  };

  // ─── Prompt assembly ───────────────────────────────────
  const SYSTEM_PROMPT = `You are a research assistant for ElectriAI, a project that mines YouTube videos and viewer Q&A comments to build a knowledge base about electrical construction. You answer questions for working electricians, apprentices, and contractors.

You will be given a small set of passages retrieved from the knowledge-base wiki. The wiki is hand-curated from video transcripts and Q&A comments, and every claim in it carries inline citations to the underlying sources:
  - (V:VIDEOID), citation to a specific YouTube video (11-character ID)
  - (Q:COMMENTID), citation to a viewer Q&A comment

Rules for your response:
1. Use ONLY the retrieved passages as evidence. Do not invent facts not present in them.
2. When you state a substantive claim, carry forward its citations exactly as they appear in the source passages, preserve the (V:VIDEOID) and (Q:COMMENTID) markers verbatim. Do not paraphrase the citation format. When citing more than one source, use a separate parenthesis for each: write (V:abc) (V:def), never (V:abc, V:def).
3. If the retrieved passages do not actually answer the user's question, say so plainly: "I don't know, that's outside the knowledge base." Do not guess.
4. Plain text, no markdown headers, no bullet points unless the user explicitly asks for a list.
5. Be concise: 2–6 sentences for most questions, longer only if the user asks for a deep explanation.`;

  const buildUserPrompt = (question, topChunks) => {
    const full = topChunks.slice(0, FULL_K);
    const compact = topChunks.slice(FULL_K);
    const fullBlocks = full.map((c, i) => {
      const ch = c.chunk;
      const head = ch.sectionTitle ? `# ${ch.title}, ${ch.sectionTitle}` : `# ${ch.title}`;
      return `[Passage ${i + 1}, score=${c.score.toFixed(3)}]\n${head}\n\n${ch.chunkText}`;
    }).join('\n\n---\n\n');
    const compactBlocks = compact.map((c, i) => {
      const ch = c.chunk;
      const snippet = (ch.chunkText || '').slice(0, COMPACT_CHARS).trim();
      return `[Passage ${FULL_K + i + 1}, score=${c.score.toFixed(3)}] ${ch.title}${ch.sectionTitle ? ', ' + ch.sectionTitle : ''}\n${snippet}${ch.chunkText.length > COMPACT_CHARS ? '…' : ''}`;
    }).join('\n\n');
    return `Retrieved passages from the ElectriAI wiki:\n\n${fullBlocks}${compactBlocks ? '\n\n---\n\n' + compactBlocks : ''}\n\n---\n\nUser question: ${question}\n\nAnswer using only the passages above. Preserve any (V:...) and (Q:...) citations exactly as they appear.`;
  };

  // ─── Citation rendering ────────────────────────────────
  // The wiki content (and Gemini sometimes) groups citations into a
  // single parens, like `(V:abc, Q:xyz, Q:def)`. Rewrite those into
  // individual `(V:abc) (Q:xyz) (Q:def)` form so the per-marker regex
  // can pick each one up. Shared between the chat renderer and the
  // cited-sources panel aggregator.
  const splitGroupedCitations = (text) =>
    text.replace(
      /\(((?:V:[A-Za-z0-9_-]{11}|Q:[^,)]+)(?:\s*,\s*(?:V:[A-Za-z0-9_-]{11}|Q:[^,)]+))+)\)/g,
      (_m, body) => body.split(/\s*,\s*/).map((t) => `(${t.trim()})`).join(' ')
    );

  // Splits a message body around (V:...) and (Q:...) markers and returns
  // an array of React nodes with proper linkification for video citations
  // and a non-link pill for comment citations.
  const renderWithCitations = (text, commentVideoLookup) => {
    if (!text) return null;
    text = splitGroupedCitations(text);
    // Dedup citations within a single message: every cite resolves to a
    // target video, and seeing the same video pill repeatedly is just
    // noise. Drop subsequent occurrences and clean up the orphan spaces /
    // dangling punctuation they leave behind.
    const seenTargets = new Set();
    text = text.replace(/\(V:([A-Za-z0-9_-]{11})\)|\(Q:([^)]+)\)/g, (m, vid, cid) => {
      const target = vid
        || (commentVideoLookup && commentVideoLookup.get(cid))
        || `q:${cid}`;
      if (seenTargets.has(target)) return '';
      seenTargets.add(target);
      return m;
    });
    text = text.replace(/ {2,}/g, ' ').replace(/ +([.,!?;:])/g, '$1');
    // Combined regex with two alternates so we can match either citation type.
    const pattern = /\(V:([A-Za-z0-9_-]{11})\)|\(Q:([^)]+)\)/g;
    const nodes = [];
    let lastIndex = 0;
    let match;
    let i = 0;
    while ((match = pattern.exec(text)) !== null) {
      if (match.index > lastIndex) {
        nodes.push(text.slice(lastIndex, match.index));
      }
      if (match[1]) {
        const vid = match[1];
        nodes.push(
          <a
            key={`v-${i}`}
            href={`https://www.youtube.com/watch?v=${vid}`}
            target="_blank"
            rel="noopener"
            className="inline-flex items-center gap-1 px-1.5 py-0 rounded bg-red-50 text-red-700 hover:bg-red-100 text-[11px] font-medium align-baseline mx-0.5"
            title={`Open YouTube video ${vid}`}
          >
            ▶ video
          </a>
        );
      } else if (match[2]) {
        const cid = match[2];
        const vid = commentVideoLookup ? commentVideoLookup.get(cid) : null;
        if (vid) {
          // The comment lives on a YouTube video, render as a video pill
          // (visually identical to V:) and deep-link with &lc= so YouTube
          // scrolls to and highlights the specific comment thread.
          nodes.push(
            <a
              key={`q-${i}`}
              href={`https://www.youtube.com/watch?v=${vid}&lc=${encodeURIComponent(cid)}`}
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 px-1.5 py-0 rounded bg-red-50 text-red-700 hover:bg-red-100 text-[11px] font-medium align-baseline mx-0.5"
              title={`Open YouTube comment ${cid} on video ${vid}`}
            >
              ▶ video
            </a>
          );
        } else {
          nodes.push(
            <span
              key={`q-${i}`}
              className="inline-flex items-center px-1.5 py-0 rounded bg-slate-100 text-slate-600 text-[11px] font-medium align-baseline mx-0.5"
              title={`Source comment ${cid}`}
            >
              comment
            </span>
          );
        }
      }
      lastIndex = pattern.lastIndex;
      i++;
    }
    if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
    return nodes;
  };

  // Aggregates retrieval scores per wiki page and returns the top N pages
  // for the "Further reading" footer. Score per page is the max chunk score
  // (so a single very-relevant chunk surfaces the whole page).
  const aggregatePageScores = (topChunks, wikiPagesBySlug) => {
    const bySlug = new Map();
    for (const { score, chunk } of topChunks) {
      const cur = bySlug.get(chunk.slug);
      if (!cur || score > cur.score) bySlug.set(chunk.slug, { score, slug: chunk.slug });
    }
    const pages = [...bySlug.values()]
      .sort((a, b) => b.score - a.score)
      .slice(0, FURTHER_K)
      .map(({ slug, score }) => ({ score, page: wikiPagesBySlug.get(slug) }))
      .filter((x) => x.page);
    return pages;
  };

  // ─── Cited sources panel ───────────────────────────────
  // Walks every assistant message, pulls (V:...) and (Q:...) markers,
  // resolves Q: comments to their parent video via commentVideoLookup,
  // and returns one card per unique video plus the count of distinct
  // comments cited from that video.
  const collectCitedSources = (messages, commentVideoLookup, rawVideos) => {
    const videoLookup = rawVideos && rawVideos.videos
      ? new Map(rawVideos.videos.map((v) => [v.videoId, v]))
      : new Map();
    const videos = new Map();
    let order = 0;
    const pattern = /\(V:([A-Za-z0-9_-]{11})\)|\(Q:([^)]+)\)/g;
    for (const m of messages) {
      if (m.role !== 'assistant' || !m.text) continue;
      // Apply the same grouped-citation normalization the renderer uses,
      // otherwise `(V:abc, Q:xyz, Q:def)` blocks are skipped entirely.
      const normalized = splitGroupedCitations(m.text);
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(normalized)) !== null) {
        const cid = match[2] || null;
        const vid = match[1] || (cid && commentVideoLookup.get(cid)) || null;
        if (!vid) continue;
        if (!videos.has(vid)) {
          const v = videoLookup.get(vid);
          videos.set(vid, {
            videoId: vid,
            title: v ? v.title : null,
            commentCount: v ? v.commentCount : 0,
            commentIds: new Set(),
            firstCommentId: null,
            order: order++,
          });
        }
        if (cid) {
          const entry = videos.get(vid);
          entry.commentIds.add(cid);
          if (!entry.firstCommentId) entry.firstCommentId = cid;
        }
      }
    }
    return [...videos.values()].sort((a, b) => a.order - b.order);
  };

  function SourcesPanel({ sources, navigate, rawVideosLoading }) {
    return (
      <div className="lg:sticky lg:top-20 bg-white border border-slate-200 rounded-lg flex flex-col h-[60vh] min-h-[480px]">
        <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
          <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500">
            Cited sources{sources.length > 0 ? ` (${sources.length})` : ''}
          </div>
          {rawVideosLoading && (
            <span className="inline-block w-3 h-3 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-3 scrollbar-thin">
          {sources.length === 0 ? (
            <div className="text-center px-3 py-12 text-slate-400">
              <p className="serif italic text-sm">No sources yet.</p>
              <p className="text-[11px] mt-2 leading-relaxed">
                Videos and comments the chatbot cites will appear here. Click any card to open it in the Raw Data tab.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {sources.map((s) => (
                <li key={s.videoId}>
                  <button
                    onClick={() => navigate && navigate('rawdata', { videoId: s.videoId, commentId: s.firstCommentId })}
                    className="w-full text-left bg-stone-50 hover:bg-stone-100 border border-slate-200 hover:border-slate-400 rounded-md p-3 transition-colors group"
                    title={`Open ${s.title || s.videoId} in Raw Data`}
                  >
                    <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-wider text-slate-500 mb-1.5">
                      <span>YouTube video</span>
                      {s.commentIds.size > 0 && (
                        <span className="text-slate-400 normal-case tracking-normal">
                          {s.commentIds.size} comment{s.commentIds.size === 1 ? '' : 's'}
                        </span>
                      )}
                    </div>
                    <div className="text-[12.5px] text-slate-800 leading-snug font-medium line-clamp-3 serif">
                      {s.title || s.videoId}
                    </div>
                    <div className="mt-2 text-[10px] text-slate-400 group-hover:text-slate-700">
                      Open in Raw Data →
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    );
  }

  // ─── Tab component ─────────────────────────────────────
  function ChatTab({ state, embeddingsLoading, embeddingsReady, devKeyAvailable, navigate, rawVideosLoading }) {
    const apiKey = state.geminiDevKey || '';
    const workerBase = state.geminiWorkerBase || '';
    // The chat is usable whenever the production Worker proxy is configured
    // (workerBase is set) OR a local dev key was pasted into localStorage.
    const apiReady = !!workerBase || devKeyAvailable;

    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [pending, setPending] = useState(false);
    const [error, setError] = useState(null);
    const [openPage, setOpenPage] = useState(null);
    const scrollRef = useRef(null);

    // Map wiki pages by slug for fast lookup when rendering further-reading.
    const wikiPagesBySlug = useMemo(() => {
      const m = new Map();
      for (const p of (state.wikiPages || [])) m.set(p.slug, p);
      return m;
    }, [state.wikiPages]);

    // commentId -> videoId lookup so (Q:...) citations can become deep links
    // to the exact YouTube comment. Sourced from the test-data subset that
    // is always loaded, plus the full raw dataset once it has been fetched.
    const commentVideoLookup = useMemo(() => {
      const m = new Map();
      for (const c of (state.comments || [])) {
        if (c.commentId && c.videoId) m.set(c.commentId, c.videoId);
      }
      if (state.rawVideos && state.rawVideos.videos) {
        for (const v of state.rawVideos.videos) {
          for (const c of (v.comments || [])) {
            if (c.commentId) m.set(c.commentId, v.videoId);
          }
        }
      }
      return m;
    }, [state.comments, state.rawVideos]);

    // Cited videos + comments aggregated across every assistant message.
    // Powers the right-side sources panel; clicking a card hands off to
    // the Raw Data tab via the `navigate` prop.
    const citedSources = useMemo(
      () => collectCitedSources(messages, commentVideoLookup, state.rawVideos),
      [messages, commentVideoLookup, state.rawVideos]
    );

    // Autoscroll to the latest message whenever the message list grows.
    useEffect(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    }, [messages, pending]);

    const canSend = apiReady && embeddingsReady && !pending && input.trim();

    const handleAsk = async () => {
      const question = input.trim();
      if (!question) return;
      if (!apiReady) {
        setError('Chat is not configured. Set the Worker URL in js/app.js for production, or paste a Gemini key into localStorage for local development.');
        return;
      }
      if (!embeddingsReady) {
        setError('Embeddings still loading, try again in a moment.');
        return;
      }

      setError(null);
      setInput('');

      // Append user message immediately for responsiveness.
      const userMsg = { role: 'user', text: question };
      const placeholder = { role: 'assistant', text: '', citationsResolved: false, references: [], pending: true };
      setMessages((m) => [...m, userMsg, placeholder]);
      setPending(true);

      try {
        // 1. Embed the question.
        const queryVec = await embedQuery(apiKey, question, workerBase);
        if (!queryVec || !queryVec.length) {
          throw new Error('Embedding API returned no vector.');
        }

        // 2. Retrieve top-K chunks by cosine similarity.
        const topChunks = retrieveTopChunks(queryVec, state.wikiEmbeddings, state.wikiChunks.chunks, TOP_K);
        if (topChunks.length === 0) {
          throw new Error('No retrievable chunks (embedding shape mismatch?).');
        }

        // 3. Aggregate top wiki pages for the "Further reading" footer.
        const references = aggregatePageScores(topChunks, wikiPagesBySlug);

        // 4. Build the prompt and stream the answer.
        const userPrompt = buildUserPrompt(question, topChunks);
        const result = await streamGenerate(apiKey, SYSTEM_PROMPT, userPrompt, (partial) => {
          setMessages((m) => {
            const next = m.slice();
            const last = next[next.length - 1];
            next[next.length - 1] = { ...last, text: partial };
            return next;
          });
        }, workerBase);

        // 5. Mark assistant message complete and attach references. Surface a
        // friendly error if the model returned nothing.
        if (!result.text) {
          setError('The model returned no text. Try rephrasing the question.');
        }
        setMessages((m) => {
          const next = m.slice();
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, references, pending: false };
          return next;
        });
      } catch (e) {
        setError(e.message || String(e));
        setMessages((m) => {
          const next = m.slice();
          if (next.length && next[next.length - 1].role === 'assistant') next.pop();
          return next;
        });
      } finally {
        setPending(false);
      }
    };

    const onKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (canSend) handleAsk();
      }
    };

    const clearChat = () => {
      setMessages([]);
      setError(null);
    };

    return (
      <div className="animate-fade py-8">

        <section className="mb-6 max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Ask ElectriAI</p>
          <h2 className="serif text-3xl sm:text-4xl font-semibold text-slate-900 leading-tight">
            Ask the knowledge base
          </h2>
          <p className="text-slate-600 mt-3 leading-relaxed">
            Type a question about electrical construction. The chatbot retrieves passages
            from the ElectriAI wiki and asks Gemini to answer using only those passages.
            Citations are preserved: <span className="inline-flex items-center px-1.5 rounded bg-red-50 text-red-700 text-[11px] font-medium">▶ video</span> links to the source YouTube video,
            <span className="inline-flex items-center px-1.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium ml-1">comment</span> marks a source Q&amp;A comment.
          </p>
        </section>

        {/* Loader / dev-key banners */}
        {!apiReady && (
          <div className="mb-4 p-4 border border-amber-200 bg-amber-50 rounded-lg text-sm text-amber-900 max-w-3xl">
            <p className="font-medium mb-1">No Gemini dev key found in localStorage.</p>
            <p className="text-amber-800 leading-relaxed">
              Ask ElectriAI requires a local Gemini key during development. Open your browser
              console and run:
            </p>
            <pre className="bg-white border border-amber-200 rounded px-3 py-2 mt-2 text-[12px] font-mono text-slate-800">localStorage.setItem('GEMINI_DEV_KEY', 'your-api-key-here'); location.reload();</pre>
          </div>
        )}

        {embeddingsLoading && (
          <div className="mb-4 p-3 border border-slate-200 bg-white rounded-lg text-sm text-slate-600 flex items-center gap-3 max-w-3xl">
            <span className="inline-block w-4 h-4 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin" />
            Loading wiki embeddings (≈3 MB)…
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 border border-red-200 bg-red-50 rounded-lg text-sm text-red-700 max-w-3xl break-all">
            {error}
          </div>
        )}

        <div className="flex flex-col lg:flex-row gap-4 items-stretch">
          <div className="flex-1 min-w-0 lg:max-w-3xl bg-white border border-slate-200 rounded-lg flex flex-col h-[60vh] min-h-[480px]">

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin">
            {messages.length === 0 && (
              <div className="text-center text-slate-400 text-sm py-12">
                <p className="serif italic">No questions yet.</p>
                <p className="mt-1 text-[12px]">Try “What size ground wire do I need for a 200 A service?”</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                    m.role === 'user'
                      ? 'bg-slate-900 text-white'
                      : 'bg-stone-50 border border-slate-200 text-slate-800'
                  }`}
                >
                  <div className="whitespace-pre-wrap">
                    {m.role === 'assistant' ? renderWithCitations(m.text, commentVideoLookup) : m.text}
                    {m.role === 'assistant' && m.pending && (
                      <span className="inline-block w-1.5 h-3 bg-slate-400 ml-1 animate-pulse align-middle" />
                    )}
                  </div>

                  {m.role === 'assistant' && m.references && m.references.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
                        Further reading
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {m.references.map(({ page, score }) => (
                          <button
                            key={page.slug}
                            onClick={() => setOpenPage(page)}
                            className="text-left text-[12.5px] text-slate-700 hover:text-slate-900 underline underline-offset-2 truncate"
                            title={`${page.slug} (score ${score.toFixed(3)})`}
                          >
                            {page.title}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Composer */}
          <div className="border-t border-slate-200 p-3">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                placeholder={apiReady ? 'Ask the wiki…' : 'Chat is not configured yet'}
                disabled={!apiReady || !embeddingsReady}
                className="flex-1 text-sm px-3 py-2 border border-slate-200 rounded-md focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 resize-none disabled:bg-slate-50 disabled:text-slate-500"
              />
              <button
                onClick={handleAsk}
                disabled={!canSend}
                className="px-4 py-2 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed self-stretch"
              >
                {pending ? '…' : 'Ask'}
              </button>
            </div>
            <div className="flex items-center justify-between mt-2 text-[11px] text-slate-400">
              <span>Enter to send · Shift+Enter for newline</span>
              {messages.length > 0 && (
                <button onClick={clearChat} className="hover:text-slate-700 underline">
                  Clear chat
                </button>
              )}
            </div>
          </div>
          </div>

          {/* Right-side cited sources panel. Auto-populates as the
              chatbot's response cites videos and comments. */}
          <aside className="lg:w-72 xl:w-80 lg:flex-shrink-0">
            <SourcesPanel
              sources={citedSources}
              navigate={navigate}
              rawVideosLoading={rawVideosLoading}
            />
          </aside>
        </div>

        {openPage && <WikiPageModal page={openPage} onClose={() => setOpenPage(null)} />}
      </div>
    );
  }

  return { ChatTab };
})();

/* Ask ElectriAI tab. Retrieves the most relevant chunks from
   kb_embeddings.json + kb_chunks.json (the taxonomy knowledge base built
   from the gpt-5-mini comment corpus and the question taxonomy) for a
   user question, then asks Gemini to answer using only those chunks.
   Retrieval is hybrid: cosine similarity plus a light keyword overlap
   boost and intent routing that steers gap/trend/answering questions
   toward the analytics pages. Citations to videos are rendered as
   clickable YouTube links; comment citations deep-link to the thread.

   Production routes through the Cloudflare Worker proxy; on localhost a
   dev key from `localStorage.setItem('GEMINI_DEV_KEY', '...')` calls the
   Gemini API directly. */

window.AppChat = (function() {
  const { useState, useEffect, useMemo, useRef } = React;
  const { WikiPageModal, StatCard } = window.AppComponents;
  const { formatNumber, formatCompact } = window.AppUtils;

  // Starter prompts shown in the empty chat. One per capability of the
  // taxonomy knowledge base: knowledge gaps, trends over time, answering
  // behavior, and grounded technical content. Clicking one fires the same
  // pipeline as typing.
  const SUGGESTED_QUESTIONS = [
    { q: 'What are the biggest knowledge gaps in electrical construction?', tag: 'Knowledge gaps' },
    { q: 'How have practitioner questions changed over the years?', tag: 'Trends' },
    { q: 'How do questions about grounding and bonding usually get answered?', tag: 'Answering behavior' },
    { q: 'Can I bond neutral and ground in a subpanel?', tag: 'Code compliance' },
  ];

  const GEMINI_EMBED_URL    = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
  const GEMINI_GENERATE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:streamGenerateContent';

  const TOP_K        = 8;   // total chunks retrieved
  const FULL_K       = 4;   // top chunks rendered in full into the prompt
  const COMPACT_CHARS = 320; // size of "compact" chunks (the rest)
  const FURTHER_K    = 3;   // knowledge-base pages surfaced in the "Further reading" footer
  const PER_PAGE_CAP = 2;   // max retrieved chunks from any single page, for diversity

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
    // Gemini 3.5 request shape: sampling parameters are gone and thinking is
    // controlled by thinkingLevel. The legacy shape (temperature +
    // thinkingBudget) is kept as a fallback so the chat still works if the
    // Worker proxy has not been redeployed and still routes to 2.5 flash,
    // which rejects the 3.5 fields with a 400.
    const makeBody = (legacy) => JSON.stringify({
      systemInstruction: { parts: [{ text: systemText }] },
      contents: [{ role: 'user', parts: [{ text: userText }] }],
      generationConfig: legacy
        ? { temperature: 0.2, maxOutputTokens: 2048, thinkingConfig: { thinkingBudget: 0 } }
        : { maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'low' } },
    });
    const post = (body) => fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    let res = await post(makeBody(false));
    if (res.status === 400) res = await post(makeBody(true));
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
  // Intent routing: questions about gaps, trends, or answering behavior get
  // their matching analytics page boosted so the retriever reliably surfaces
  // the corpus-level statistics pages, not just topically similar families.
  const INTENT_ROUTES = [
    { re: /\b(gap|gaps|unanswered|ignored|no answers?|never answered|least answered|bottleneck|underserved|missing knowledge|opportunit)/i,
      slugs: ['knowledge-gaps'] },
    { re: /\b(trend|trends|over time|over the years|changed?|changing|evolv|history|historical|by year|per year|rising|growing|declin|fading|recent years)/i,
      slugs: ['trends-over-time'] },
    { re: /\b(how (do|are|does|often).*(answer|answered|solutions?|replie[sd]|respond)|answer types?|answer mechanisms?|solutions? (are )?(provided|delivered|given)|who answers|referral|kinds? of (answers?|replies))/i,
      slugs: ['how-solutions-are-provided'] },
    { re: /\b(how many|corpus|dataset|data set|whole|overall|what (is|can) (this|the) (knowledge base|chatbot|assistant)|taxonomy)\b/i,
      slugs: ['overview'] },
  ];
  const INTENT_BOOST = 0.08;

  // Keyword overlap boost: cheap lexical signal layered on top of cosine so
  // exact term matches (family labels, code article words) win ties.
  const STOPWORDS = new Set(['the', 'and', 'for', 'are', 'was', 'what', 'when', 'where', 'which', 'with',
    'that', 'this', 'have', 'has', 'how', 'why', 'can', 'you', 'about', 'does', 'not', 'get', 'question',
    'questions', 'answer', 'answers', 'electrical', 'construction']);
  const queryTerms = (q) =>
    q.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOPWORDS.has(t));

  const keywordBoost = (terms, chunk) => {
    if (!terms.length) return 0;
    const title = chunk.title.toLowerCase();
    const text = chunk.chunkText.toLowerCase();
    let boost = 0;
    for (const t of terms) {
      if (title.includes(t)) boost += 0.02;
      else if (text.includes(t)) boost += 0.005;
    }
    return Math.min(boost, 0.08);
  };

  // Returns the top-K (chunkKey, score, chunk) triples for a query. Score is
  // cosine similarity plus the keyword and intent boosts; at most
  // PER_PAGE_CAP chunks per page keep the passage set diverse.
  const retrieveTopChunks = (queryText, queryVector, embeddings, chunks, k) => {
    const terms = queryTerms(queryText);
    const intentSlugs = new Set();
    for (const route of INTENT_ROUTES) {
      if (route.re.test(queryText)) route.slugs.forEach((s) => intentSlugs.add(s));
    }
    const scored = [];
    for (const key in embeddings) {
      const vec = embeddings[key];
      if (!vec || vec.length !== queryVector.length) continue;
      const chunk = chunks[key];
      if (!chunk) continue;
      let score = cosineSimilarity(queryVector, vec) + keywordBoost(terms, chunk);
      if (intentSlugs.has(chunk.slug)) score += INTENT_BOOST;
      scored.push({ key, score, chunk });
    }
    scored.sort((a, b) => b.score - a.score);
    const picked = [];
    const perPage = new Map();
    for (const s of scored) {
      const used = perPage.get(s.chunk.slug) || 0;
      if (used >= PER_PAGE_CAP) continue;
      perPage.set(s.chunk.slug, used + 1);
      picked.push(s);
      if (picked.length >= k) break;
    }
    return picked;
  };

  // ─── Prompt assembly ───────────────────────────────────
  const SYSTEM_PROMPT = `You are a research assistant for ElectriAI, a project that mines YouTube comment threads on electrical construction videos to map what practitioners ask and how their questions get answered. You answer questions for working electricians, apprentices, contractors, and researchers.

You will be given passages retrieved from the ElectriAI knowledge base. The knowledge base is compiled from 16,862 comment threads analyzed by GPT-5-mini and a question taxonomy of 14,980 classified practitioner questions (11 question types, 263 question families, 10 answer types, posted 2011 to 2025). Its pages carry real statistics (question counts, reply rates, answer rates, yearly activity) plus verbatim practitioner questions and the answers they received. Citations in the passages point to the underlying sources:
  - (V:VIDEOID), citation to a specific YouTube video (11-character ID)
  - (Q:COMMENTID), citation to a viewer Q&A comment thread

You can answer four kinds of question:
  - Knowledge gaps: which topics go unanswered, using the gap statistics in the passages
  - Trends over time: how question volume and mix shifted across years
  - Answering behavior: how solutions get delivered (prescriptions, explanations, code citations, referrals, and so on)
  - Technical electrical questions: answer from the practitioner Q&A evidence in the passages

Rules for your response:
1. Use ONLY the retrieved passages as evidence. Do not invent facts, statistics, or code references not present in them.
2. When you state a substantive claim or quote practitioner Q&A, carry forward its citations exactly as they appear, preserving the (V:VIDEOID) and (Q:COMMENTID) markers verbatim. When citing more than one source, use a separate parenthesis for each: write (V:abc) (V:def), never (V:abc, V:def). Statistics from the knowledge base pages need no citation markers, but name the page they come from.
3. When you give numbers, quote them exactly from the passages and mention the relevant denominator (for example "of replied questions").
4. If the retrieved passages do not actually answer the user's question, say so plainly: "I don't know, that's outside the knowledge base." Do not guess. For safety-critical work, remind the user to verify with a licensed electrician or the authority having jurisdiction.
5. Plain text, no markdown headers, no bullet points unless the user explicitly asks for a list.
6. Be concise: 2 to 6 sentences for most questions, longer only if the user asks for a deep explanation or a ranked list.`;

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
    return `Retrieved passages from the ElectriAI knowledge base:\n\n${fullBlocks}${compactBlocks ? '\n\n---\n\n' + compactBlocks : ''}\n\n---\n\nUser question: ${question}\n\nAnswer using only the passages above. Preserve any (V:...) and (Q:...) citations exactly as they appear.`;
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

  function SourcesPanel({ sources, navigate, rawVideosLoading, height }) {
    return (
      <div
        className="lg:sticky lg:top-20 bg-white border border-slate-200 rounded-lg flex flex-col h-[60vh] min-h-[440px] lg:min-h-0"
        style={height ? { height } : undefined}
      >
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

  // ─── Hero stat ribbon ──────────────────────────────────
  // "What's inside the knowledge base" counters drawn straight from the
  // kb_pages.json meta block. Renders the shared StatCard so these tiles
  // look and behave exactly like the Findings (home) headline stats: white
  // cards that count up from zero on scroll-in and lift on hover.
  function KbStatRibbon({ meta }) {
    if (!meta) return null;
    const items = [
      { value: meta.questions,        label: 'Classified questions', format: formatNumber },
      { value: meta.questionFamilies, label: 'Question families',    format: formatNumber },
      { value: meta.answered,         label: 'Answered questions',   format: formatNumber },
      { value: meta.videos,           label: 'YouTube videos',       format: formatNumber },
      { value: meta.pages,            label: 'Knowledge-base pages', format: formatNumber },
    ];
    return (
      <div className="mt-5 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        {items.map((it) => (
          <StatCard key={it.label} label={it.label} value={it.value} format={it.format} />
        ))}
      </div>
    );
  }

  // ─── Suggested-question chips ──────────────────────────
  // Rendered inside the empty chat state. `onPick` fires the real ask
  // pipeline; `disabled` mirrors the composer's readiness so a click can
  // never race the embeddings load.
  function SuggestedQuestions({ onPick, disabled }) {
    return (
      <div className="max-w-xl mx-auto">
        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-400 font-semibold mb-2.5">
          Try asking
        </div>
        <div className="grid sm:grid-cols-2 gap-2 text-left">
          {SUGGESTED_QUESTIONS.map(({ q, tag }) => (
            <button
              key={q}
              onClick={() => onPick(q)}
              disabled={disabled}
              className="kb-suggest group flex items-start gap-2.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 hover:border-slate-400"
            >
              <span className="mt-0.5 flex-shrink-0 w-6 h-6 rounded-md bg-slate-900 text-white flex items-center justify-center text-[11px] group-hover:bg-slate-700 transition-colors">
                ↳
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] text-slate-800 leading-snug font-medium">{q}</span>
                <span className="block text-[10px] uppercase tracking-wider text-slate-400 mt-1">{tag}</span>
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ─── "How it works" pipeline figure ────────────────────
  // Five-stage retrieval-augmented-generation flow, mirrored from the code
  // in this file (embed → cosine retrieve top-K → grounded generation).
  // Steps connect with a chevron that flips vertical on narrow screens.
  function HowItWorksFigure() {
    const steps = [
      { n: 1, title: 'Your question', detail: 'Asked in plain English',                        ring: 'linear-gradient(135deg,#334155,#0f172a)' },
      { n: 2, title: 'Embed',         detail: 'Gemini maps it to a 768-dimension vector',       ring: 'linear-gradient(135deg,#38bdf8,#0369a1)' },
      { n: 3, title: 'Retrieve',      detail: 'Cosine similarity plus keyword and intent boosts rank the knowledge base; top 8 win', ring: 'linear-gradient(135deg,#34d399,#047857)' },
      { n: 4, title: 'Generate',      detail: 'Gemini 3.5 Flash answers from those passages only', ring: 'linear-gradient(135deg,#a78bfa,#6d28d9)' },
      { n: 5, title: 'Cited answer',  detail: 'Every claim keeps its ▶ video / comment source', ring: 'linear-gradient(135deg,#fbbf24,#d97706)' },
    ];
    return (
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <header className="px-6 pt-5 pb-4 border-b border-slate-100 space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Under the hood</div>
          <h3 className="serif text-lg font-semibold text-slate-900 leading-snug">How Ask ElectriAI answers</h3>
          <p className="text-sm text-slate-600 serif">
            Retrieval-augmented generation keeps every answer tethered to the source knowledge base, never the model's imagination.
          </p>
        </header>
        <div className="p-6 bg-stone-50">
          <div className="flex flex-col lg:flex-row lg:items-stretch gap-2">
            {steps.map((s, i) => (
              <React.Fragment key={s.n}>
                <div className="kb-step-card flex-1 rounded-xl border border-slate-200 bg-white p-4">
                  <div
                    className="w-9 h-9 rounded-lg text-white flex items-center justify-center serif text-base font-semibold shadow-sm"
                    style={{ background: s.ring }}
                  >
                    {s.n}
                  </div>
                  <div className="text-sm font-semibold text-slate-900 mt-3">{s.title}</div>
                  <div className="text-[12px] text-slate-600 leading-relaxed mt-1">{s.detail}</div>
                </div>
                {i < steps.length - 1 && (
                  <div className="flex items-center justify-center text-slate-300 lg:px-0.5">
                    <span className="lg:hidden text-lg leading-none">↓</span>
                    <span className="hidden lg:inline text-lg leading-none">→</span>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ─── Knowledge-base coverage figure ────────────────────
  // Left: a conic-gradient donut splitting the knowledge-base pages by
  // page kind (question families, question types, answer types, corpus
  // analytics). Right: the largest question families by member questions,
  // as animated bars.
  function CoverageFigure({ wikiPages, meta }) {
    if (!wikiPages || !wikiPages.length) return null;
    const KINDS = [
      { type: 'family',        label: 'question families', color: '#0f172a' },
      { type: 'question-type', label: 'question types',    color: '#0ea5e9' },
      { type: 'answer-type',   label: 'answer types',      color: '#f59e0b' },
      { type: 'analytics',     label: 'analytics',         color: '#8b5cf6' },
      { type: 'overview',      label: 'overview',          color: '#94a3b8' },
    ];
    const counts = KINDS.map((k) => ({ ...k, count: wikiPages.filter((p) => p.type === k.type).length }))
      .filter((k) => k.count > 0);
    const total = counts.reduce((s, k) => s + k.count, 0) || 1;
    let acc = 0;
    const gradientStops = counts.map((k) => {
      const from = (acc / total) * 100;
      acc += k.count;
      const to = (acc / total) * 100;
      return `${k.color} ${from}% ${to}%`;
    }).join(', ');
    const top = wikiPages
      .filter((p) => p.type === 'family' && p.sourceCount)
      .sort((a, b) => b.sourceCount - a.sourceCount)
      .slice(0, 8);
    const max = top.length ? top[0].sourceCount : 1;

    return (
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <header className="px-6 pt-5 pb-4 border-b border-slate-100 space-y-1.5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">Coverage</div>
          <h3 className="serif text-lg font-semibold text-slate-900 leading-snug">What the knowledge base covers</h3>
          <p className="text-sm text-slate-600 serif">
            {total} pages compiled from the question taxonomy{meta ? `: ${formatNumber(meta.questions)} classified practitioner questions across ${formatNumber(meta.videos)} videos, with per-family statistics, real question and answer pairs, yearly activity, and corpus analytics for knowledge gaps, trends, and answering behavior` : ''}.
          </p>
        </header>
        <div className="p-6 grid md:grid-cols-[minmax(0,220px)_1fr] gap-8 items-center">
          {/* Donut: page composition by kind */}
          <div className="flex flex-col items-center">
            <div className="relative w-44 h-44">
              <div
                className="w-full h-full rounded-full"
                style={{ background: `conic-gradient(${gradientStops})` }}
              />
              <div className="absolute inset-[15px] rounded-full bg-white flex flex-col items-center justify-center">
                <span className="serif text-4xl font-semibold text-slate-900 leading-none tabular-nums">{total}</span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500 mt-1">pages</span>
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 mt-4 text-[12px]">
              {counts.map((k) => (
                <span key={k.type} className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: k.color }} />
                  <span className="text-slate-700 font-medium">{k.count}</span>
                  <span className="text-slate-500">{k.label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Largest question families by member questions */}
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-3">
              Largest question families · member questions
            </div>
            <ul className="space-y-2.5">
              {top.map((p, i) => {
                const pct = Math.max(6, Math.round((p.sourceCount / max) * 100));
                return (
                  <li key={p.slug}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <span className="text-[12.5px] text-slate-800 font-medium truncate" title={p.title}>{p.title}</span>
                      <span className="text-[11px] text-slate-500 tabular-nums flex-shrink-0">{formatNumber(p.sourceCount)}</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="kb-bar-fill h-full rounded-full"
                        style={{ width: `${pct}%`, background: '#0f172a', animationDelay: `${i * 80}ms` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
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

    // Fit-to-viewport: on desktop, size the chat (and sources) panel so its
    // bottom lands just above the fold, letting the whole initial chat state
    // show without page-scrolling. On mobile (<lg) we fall back to the CSS
    // height and let the page scroll normally. Re-measures on resize and
    // whenever a banner above the panel changes the row's top offset.
    const chatRowRef = useRef(null);
    const [panelHeight, setPanelHeight] = useState(null);
    useEffect(() => {
      const measure = () => {
        if (window.innerWidth < 1024) { setPanelHeight(null); return; }
        const el = chatRowRef.current;
        if (!el) return;
        // Use the row's offset from the top of the DOCUMENT, not the
        // viewport. getBoundingClientRect().top is viewport-relative, so if
        // this runs before the tab switch finishes scrolling back to the top
        // (e.g. arriving from a scrolled Findings page) it reads small/negative
        // and the panel stretches down the screen. Adding scrollY makes the
        // measurement scroll-independent: it's the height as if unscrolled.
        const docTop = el.getBoundingClientRect().top + window.scrollY;
        setPanelHeight(Math.max(320, Math.round(window.innerHeight - docTop - 16)));
      };
      measure();
      const raf = requestAnimationFrame(measure);
      window.addEventListener('resize', measure);
      return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', measure); };
    }, [apiReady, embeddingsLoading, error]);

    const hasSources = citedSources.length > 0;

    // `canAsk` gates the suggestion chips (no typed input required);
    // `canSend` additionally requires a non-empty composer for the button.
    const canAsk = apiReady && embeddingsReady && !pending;
    const canSend = canAsk && input.trim();

    // Accepts an optional forced question (from a suggestion chip); falls
    // back to the composer's current value when called from the button.
    const handleAsk = async (forced) => {
      const question = (typeof forced === 'string' ? forced : input).trim();
      if (!question) return;
      if (pending) return;
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

        // 2. Retrieve top-K chunks: cosine plus keyword and intent boosts.
        const topChunks = retrieveTopChunks(question, queryVec, state.wikiEmbeddings, state.wikiChunks.chunks, TOP_K);
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
      <div className="animate-fade py-6">

        <section className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white mb-5">
          <div className="absolute inset-0 kb-hero-glow" aria-hidden="true" />
          <div className="absolute inset-0 kb-hero-grid opacity-70" aria-hidden="true" />
          <div className="relative px-6 sm:px-8 py-6">
            <div className="max-w-3xl">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-300/70 bg-white/70 backdrop-blur-sm px-3 py-1 text-[10.5px] uppercase tracking-[0.18em] text-slate-600 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Retrieval-augmented · grounded in the knowledge base
              </span>
              <h2 className="serif text-3xl sm:text-4xl font-semibold text-slate-900 leading-tight mt-4">
                Ask the knowledge base
              </h2>
              <p className="text-slate-600 mt-2.5 leading-relaxed">
                Ask about electrical construction, knowledge gaps, question trends over time, or how
                practitioners answer each other. Answers come only from passages retrieved from the
                taxonomy knowledge base, so every claim stays traceable. Citations:
                <span className="inline-flex items-center px-1.5 rounded bg-red-50 text-red-700 text-[11px] font-medium ml-1">▶ video</span> links the source YouTube video,
                <span className="inline-flex items-center px-1.5 rounded bg-slate-100 text-slate-600 text-[11px] font-medium ml-1">comment</span> marks a Q&amp;A comment.
              </p>
            </div>
            <KbStatRibbon meta={state.kbMeta} />
          </div>
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

        <div ref={chatRowRef} className="flex flex-col lg:flex-row gap-4 items-stretch">
          <div
            className={`${hasSources ? 'flex-1 min-w-0 lg:max-w-3xl' : 'w-full max-w-3xl mx-auto'} bg-slate-100 border border-slate-200 rounded-lg flex flex-col h-[60vh] min-h-[440px] lg:min-h-0`}
            style={panelHeight ? { height: panelHeight } : undefined}
          >

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-4 scrollbar-thin">
            {messages.length === 0 && (
              <div className="py-4">
                <div className="text-center mb-4">
                  <div className="mx-auto w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center mb-2.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-6 h-6" aria-hidden="true">
                    <path d="M12 8V4H8" />
                    <rect width="16" height="12" x="4" y="8" rx="2" />
                    <path d="M2 14h2" />
                    <path d="M20 14h2" />
                    <path d="M15 13v2" />
                    <path d="M9 13v2" />
                  </svg>
                </div>
                  <p className="serif italic text-slate-500 text-sm">Ask a question to get started.</p>
                </div>
                <SuggestedQuestions onPick={(q) => handleAsk(q)} disabled={!canAsk} />
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
                onClick={() => handleAsk()}
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

          {/* Right-side cited sources panel. Hidden until the chatbot has
              actually cited a video or comment, so the empty initial state
              stays clean and the chat can use the full width. */}
          {hasSources && (
            <aside className="lg:w-72 xl:w-80 lg:flex-shrink-0">
              <SourcesPanel
                sources={citedSources}
                navigate={navigate}
                rawVideosLoading={rawVideosLoading}
                height={panelHeight}
              />
            </aside>
          )}
        </div>

        {/* Below-the-fold explainers: how the retrieval pipeline works and
            what the knowledge base actually contains. Both draw only on the
            eagerly-loaded datasets, so they render instantly with the tab. */}
        <section className="mt-10 space-y-6">
          <HowItWorksFigure />
          <CoverageFigure wikiPages={state.wikiPages} stats={state.stats} />
        </section>

        {openPage && <WikiPageModal page={openPage} onClose={() => setOpenPage(null)} />}
      </div>
    );
  }

  return { ChatTab };
})();

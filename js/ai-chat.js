/* =========================================================
   AI Chat (RAG-based Q&A)
   ─────────────────────────────────────────────────────────
   Free-form question answering grounded in the 148 reviewed
   papers. Uses a Retrieval-Augmented Generation pattern:

     1. paper_embeddings.json (pre-computed by Python script)
        is loaded once at component mount.
     2. When the user asks a question, we embed the question
        via Gemini Embedding API, compute cosine similarity
        with all paper embeddings, and select the top-k most
        relevant papers.
     3. Only those top-k paper summaries are sent to Gemini
        along with the question, so each Q&A call costs
        ~3-5K tokens regardless of corpus size.

   ⚠️ TESTING MODE - Same security caveats as ai-assistant.js:
   the API key is inlined client-side. Move to a Cloudflare
   Worker proxy before public deployment.
   ========================================================= */

window.AppCharts = window.AppCharts || {};

(function() {
  const { useState, useEffect, useRef } = React;

  // ─── API endpoints ──────────────────────────────────────
  // The component prefers a Cloudflare Worker proxy if `workerBase`
  // prop is set. Otherwise it falls back to calling Gemini directly
  // with `apiKey` (only suitable for local development).
  const GEMINI_GENERATE_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
  const GEMINI_EMBED_ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent';
  // Three-tier retrieval strategy:
  //   - Top CITED_K papers get full context sent to the LLM (evidence for citations)
  //   - Next MENTIONED_K papers get compact context (supporting pattern recognition)
  //   - Next FURTHER_K papers are not sent to the LLM at all, only shown in the UI
  //     under "Further reading" so the user can explore them.
  const CITED_K = 3;
  const MENTIONED_K = 4;
  const FURTHER_K = 5;
  const TOP_K = CITED_K + MENTIONED_K + FURTHER_K; // 12 total

  // ─── Vector math ────────────────────────────────────────
  const cosineSimilarity = (a, b) => {
    let dot = 0, normA = 0, normB = 0;
    for (let i = 0; i < a.length; i++) {
      dot += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dot / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  // ─── Embedding API call ─────────────────────────────────
  // If `workerBase` is set, posts to {workerBase}/api/embed and the
  // Worker injects the API key server-side. Otherwise calls Gemini
  // directly with `apiKey` (local development only).
  const embedQuestion = async (workerBase, apiKey, text) => {
    const useWorker = !!workerBase;
    const url = useWorker
      ? `${workerBase}/api/embed`
      : `${GEMINI_EMBED_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
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
      throw new Error(`Embedding API error (${res.status}): ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    return data?.embedding?.values || data?.embeddings?.[0]?.values;
  };

  // ─── Generation API call ────────────────────────────────
  // citedPapers: top papers with full context (LLM should cite these)
  // mentionedPapers: supporting papers with compact context (LLM may cite if relevant)
  const askGemini = async (workerBase, apiKey, question, citedPapers, mentionedPapers, conversationHistory) => {
    // Full context block for top-tier cited papers
    const citedBlocks = citedPapers.map((p, i) => {
      const s = p.summary || {};
      const lines = [
        `[${i + 1}] ${p.citation}`,
        s.title ? `  Title: ${s.title}` : null,
        s.topic ? `  Topic: ${s.topic}` : null,
        s.ai_model ? `  AI: ${s.ai_model}` : null,
        s.method ? `  Method: ${s.method}` : null,
        s.abstract ? `  Abstract: ${s.abstract}` : null,
        s.results ? `  Results: ${s.results}` : null,
        s.gaps ? `  Gaps: ${s.gaps}` : null,
        s.future ? `  Future research: ${s.future}` : null,
      ].filter(Boolean);
      return lines.join('\n');
    }).join('\n\n');

    // Compact context block for supporting papers (~30% of full size)
    // Numbering continues from CITED_K, so [4], [5], etc.
    const mentionedBlocks = mentionedPapers.map((p, i) => {
      const s = p.summary || {};
      const idx = citedPapers.length + i + 1;
      const lines = [
        `[${idx}] ${p.citation}`,
        s.title ? `  Title: ${s.title}` : null,
        s.topic ? `  Topic: ${s.topic}` : null,
        s.ai_model ? `  AI: ${s.ai_model}` : null,
        s.gaps ? `  Gaps: ${s.gaps.slice(0, 200)}${s.gaps.length > 200 ? '…' : ''}` : null,
      ].filter(Boolean);
      return lines.join('\n');
    }).join('\n\n');

    const systemContext = `You are a research assistant for a systematic review of AI applications in construction management (148 peer-reviewed papers, 2006-2026).

You have been retrieved a small set of relevant papers, organised in two tiers:

PRIMARY SOURCES [1] to [${citedPapers.length}] - the most relevant papers, with full context. Cite these directly using bracketed numbers like [1], [2], [3]. These should be your main evidence.

SUPPORTING SOURCES [${citedPapers.length + 1}] to [${citedPapers.length + mentionedPapers.length}] - additional relevant papers shown in compact form. You MAY cite these only if they add something the primary sources do not already cover. Prefer primary sources whenever possible.

Rules:
1. Provide a COMPLETE answer. Do not stop mid-sentence.
2. Structure longer answers naturally:
   - For "what/how" questions: 2-4 sentences, direct answer.
   - For analytical questions ("which X are underexplored", "why does Y happen", "compare A vs B"): brief overview (1-2 sentences) + 2-4 specific findings each grounded in cited papers + a closing observation.
   - For factual lookup: 2-3 sentences max.
3. Cite EVERY substantive claim with a paper number. Multiple papers supporting one claim should be cited together like [1, 2].
4. Lean heavily on PRIMARY SOURCES [1]-[${citedPapers.length}]. Use SUPPORTING SOURCES [${citedPapers.length + 1}]-[${citedPapers.length + mentionedPapers.length}] sparingly, only when they add unique evidence.
5. If the retrieved papers do not contain enough information to fully answer, say so explicitly. Do not hallucinate.
6. Plain academic prose. No markdown bold (** **) or headers (#). No bullet points unless the user explicitly asks for a list.

PRIMARY SOURCES:

${citedBlocks}

SUPPORTING SOURCES:

${mentionedBlocks}`;

    // Build conversation contents
    const contents = [];
    // First message: system context + history + new question, all as user role
    // (Gemini doesn't have a system role on free tier; we prepend context to first turn)
    if (conversationHistory.length === 0) {
      contents.push({ role: 'user', parts: [{ text: systemContext + '\n\nUSER QUESTION: ' + question }] });
    } else {
      // Subsequent turns: rebuild conversation, with fresh paper context for current question
      conversationHistory.forEach(msg => {
        contents.push({ role: msg.role, parts: [{ text: msg.text }] });
      });
      contents.push({ role: 'user', parts: [{ text: systemContext + '\n\nUSER QUESTION: ' + question }] });
    }

    const useWorker = !!workerBase;
    const url = useWorker
      ? `${workerBase}/api/generate`
      : `${GEMINI_GENERATE_ENDPOINT}?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`Generation API error (${res.status}): ${errText.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned no content. The prompt may have been blocked.');
    return text;
  };

  // ─── Main component ─────────────────────────────────────
  const AIChat = ({ papersData, apiKey, workerBase, onPaperClick }) => {
    const [embeddings, setEmbeddings] = useState(null);
    const [embeddingError, setEmbeddingError] = useState(null);
    const [embeddingLoading, setEmbeddingLoading] = useState(true);
    const [messages, setMessages] = useState([]);
    const [question, setQuestion] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const messagesEndRef = useRef(null);

    // Load pre-computed embeddings
    useEffect(() => {
      let cancelled = false;
      fetch('./paper_embeddings.json')
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(data => {
          if (cancelled) return;
          setEmbeddings(data);
          setEmbeddingLoading(false);
        })
        .catch(err => {
          if (cancelled) return;
          setEmbeddingError(err.message);
          setEmbeddingLoading(false);
        });
      return () => { cancelled = true; };
    }, []);

    // Auto-scroll to latest message
    useEffect(() => {
      if (messagesEndRef.current) {
        messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }, [messages, loading]);

    // Build a quick lookup from paper id to full record (for citation links)
    const paperById = React.useMemo(() => {
      const map = new Map();
      papersData.forEach(p => map.set(String(p.ID), p));
      return map;
    }, [papersData]);

    // Either a Worker proxy URL or a valid inlined API key allows us to call Gemini.
    const apiConfigured = !!workerBase || (apiKey && apiKey !== 'YOUR_API_KEY_HERE' && apiKey.length > 10);
    const usingWorker = !!workerBase;

    const submit = async () => {
      const q = question.trim();
      if (!q) return;
      if (!apiConfigured) {
        setError('AI Assistant not configured. Set GEMINI_WORKER_BASE (production) or GEMINI_API_KEY (local) in js/app.js.');
        return;
      }
      if (!embeddings) {
        setError('Embeddings not loaded. Make sure paper_embeddings.json is in the same folder as index.html.');
        return;
      }

      setError(null);
      setQuestion('');
      setLoading(true);

      // Add user message immediately
      const userMsg = { role: 'user', text: q };
      setMessages(prev => [...prev, userMsg]);

      try {
        // Step 1: Embed the question
        const queryVec = await embedQuestion(workerBase, apiKey, q);
        if (!queryVec || queryVec.length === 0) {
          throw new Error('Embedding API returned empty vector.');
        }

        // Step 2: Find top-k similar papers and split into tiers
        const scored = embeddings.papers.map(p => ({
          ...p,
          score: cosineSimilarity(queryVec, p.embedding),
        }));
        scored.sort((a, b) => b.score - a.score);
        const cited = scored.slice(0, CITED_K);
        const mentioned = scored.slice(CITED_K, CITED_K + MENTIONED_K);
        const further = scored.slice(CITED_K + MENTIONED_K, TOP_K);

        // APA-style disambiguation: when two or more distinct papers share the
        // same "Author (Year)" citation string within this retrieval set, append
        // a, b, c... in the order they appear. This matches the convention used
        // in the manuscript itself (e.g., Wuni 2025a vs Wuni 2025b).
        // Done BEFORE the LLM call so its answer text uses the disambiguated
        // names too, not just the references list below the answer.
        const allRetrieved = [...cited, ...mentioned, ...further];
        const citationCounts = new Map();
        allRetrieved.forEach(p => {
          const c = p.citation;
          if (!citationCounts.has(c)) citationCounts.set(c, new Set());
          citationCounts.get(c).add(String(p.id));
        });
        // Build id -> disambiguated citation map for any colliding citation strings
        const disambigMap = new Map();
        citationCounts.forEach((idSet, originalCitation) => {
          if (idSet.size > 1) {
            // Assign suffixes in the order ids first appear in allRetrieved
            const seenIds = [];
            allRetrieved.forEach(p => {
              if (p.citation === originalCitation && !seenIds.includes(String(p.id))) {
                seenIds.push(String(p.id));
              }
            });
            seenIds.forEach((pid, i) => {
              const suffix = String.fromCharCode(97 + i); // 'a', 'b', 'c'...
              const newCitation = originalCitation.replace(/\((\d{4})\)/, `($1${suffix})`);
              disambigMap.set(pid, newCitation);
            });
          }
        });
        // Apply disambiguation in place so cited/mentioned arrays reflect new
        // citation strings before they are passed to askGemini.
        const applyDisambig = (papers) => papers.map(p => {
          const newCitation = disambigMap.get(String(p.id));
          return newCitation ? { ...p, citation: newCitation } : p;
        });
        const citedDisambig = applyDisambig(cited);
        const mentionedDisambig = applyDisambig(mentioned);
        const furtherDisambig = applyDisambig(further);

        // Step 3: Ask Gemini with retrieved context
        // Pass conversation history so follow-up questions work
        const history = messages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
        const answer = await askGemini(workerBase, apiKey, q, citedDisambig, mentionedDisambig, history);

        // Build the unified retrieved list with tier annotations.
        // Citation indices [1]-[CITED_K] are cited papers, [CITED_K+1]-[CITED_K+MENTIONED_K]
        // are mentioned papers. Further-reading papers have no citation index.
        const retrieved = [
          ...citedDisambig.map((p, i) => ({
            idx: i + 1,
            tier: 'cited',
            id: p.id,
            citation: p.citation,
            title: p.summary?.title || '',
            score: p.score,
          })),
          ...mentionedDisambig.map((p, i) => ({
            idx: CITED_K + i + 1,
            tier: 'mentioned',
            id: p.id,
            citation: p.citation,
            title: p.summary?.title || '',
            score: p.score,
          })),
          ...furtherDisambig.map((p, i) => ({
            idx: null, // not citable
            tier: 'further',
            id: p.id,
            citation: p.citation,
            title: p.summary?.title || '',
            score: p.score,
          })),
        ];

        const assistantMsg = {
          role: 'assistant',
          text: answer,
          retrieved,
        };
        setMessages(prev => [...prev, assistantMsg]);
      } catch (e) {
        setError(e.message || String(e));
        // Remove the user message if the call failed, so they can retry
      } finally {
        setLoading(false);
      }
    };

    const reset = () => {
      setMessages([]);
      setError(null);
      setQuestion('');
    };

    // Render assistant text with citation chips. Match [1], [2,3], [1, 5, 8] etc.
    // Also handle paragraph breaks (double newlines) and strip stray markdown bold.
    const renderAssistantText = (text, retrieved) => {
      if (!retrieved) return <span>{text}</span>;
      // Strip markdown bold ** ** since the rendered output already styles paragraphs
      const cleanText = text.replace(/\*\*(.+?)\*\*/g, '$1');
      // Only cited and mentioned papers have idx; further-reading ones do not
      const retrievedByIdx = new Map(
        retrieved.filter(r => r.idx != null).map(r => [r.idx, r])
      );

      // Split into paragraphs first, then render citations within each paragraph
      const paragraphs = cleanText.split(/\n\n+/);
      return (
        <>
          {paragraphs.map((para, pi) => {
            const parts = [];
            const regex = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
            let lastIndex = 0;
            let match;
            let key = 0;
            while ((match = regex.exec(para)) !== null) {
              if (match.index > lastIndex) {
                parts.push(<span key={key++}>{para.slice(lastIndex, match.index)}</span>);
              }
              const indices = match[1].split(',').map(s => parseInt(s.trim()));
              parts.push(
                <span key={key++} className="inline-flex flex-wrap gap-0.5 items-baseline">
                  {indices.map((idx, j) => {
                    const r = retrievedByIdx.get(idx);
                    if (!r) return <span key={j}>[{idx}]</span>;
                    const paper = paperById.get(String(r.id));
                    return (
                      <button
                        key={j}
                        onClick={() => paper && onPaperClick && onPaperClick(paper)}
                        title={`${r.citation} ${r.title}`}
                        className="text-[10px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-900 hover:text-white border border-slate-300 px-1 py-px rounded transition-colors align-baseline"
                      >
                        {idx}
                      </button>
                    );
                  })}
                </span>
              );
              lastIndex = regex.lastIndex;
            }
            if (lastIndex < para.length) {
              parts.push(<span key={key++}>{para.slice(lastIndex)}</span>);
            }
            return (
              <p key={pi} className={pi > 0 ? 'mt-3' : ''}>
                {parts}
              </p>
            );
          })}
        </>
      );
    };

    // ─── Loading state ────────────────────────────────────
    if (embeddingLoading) {
      return (
        <div className="bg-white border border-slate-200 rounded-lg p-8 text-center">
          <div className="inline-block w-5 h-5 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mb-2"></div>
          <p className="text-sm text-slate-600">Loading paper embeddings…</p>
        </div>
      );
    }

    if (embeddingError) {
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-5">
          <div className="font-semibold text-amber-900 mb-2">Embeddings file not found</div>
          <p className="text-xs text-amber-900 leading-relaxed mb-3">
            The Q&amp;A feature needs <code className="bg-amber-100 px-1 rounded">paper_embeddings.json</code> next to index.html.
            Generate it once by running <code className="bg-amber-100 px-1 rounded">compute_embeddings.py</code>:
          </p>
          <pre className="bg-white border border-amber-200 rounded p-2 text-[11px] text-amber-900 overflow-x-auto">{`pip install google-genai pandas
python compute_embeddings.py`}</pre>
          <p className="text-[11px] text-amber-800 mt-2">Error: {embeddingError}</p>
        </div>
      );
    }

    // ─── Main UI ──────────────────────────────────────────
    const exampleQuestions = [
      'Which AI techniques are most underexplored in cost estimation?',
      'What are the main barriers to deploying construction AI in real projects?',
      'How do papers handle the small-dataset problem?',
      'Which papers use explainable AI methods, and for what tasks?',
    ];

    return (
      <div className="space-y-4">
        {!apiConfigured && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-900">
            <div className="font-semibold mb-1">AI Assistant not configured</div>
            <div className="text-xs leading-relaxed">
              For production: set <code className="bg-amber-100 px-1 rounded">GEMINI_WORKER_BASE</code> in <code className="bg-amber-100 px-1 rounded">js/app.js</code> to your Cloudflare Worker URL.
              For local testing only: set <code className="bg-amber-100 px-1 rounded">GEMINI_API_KEY</code> in the same file.
            </div>
          </div>
        )}

        <div className="bg-white border border-slate-200 rounded-lg p-5">
          <div className="flex items-baseline justify-between gap-3 mb-3">
            <div>
              <h3 className="serif text-lg font-semibold text-slate-900">Ask the corpus</h3>
              <p className="text-xs text-slate-500">
                Question goes in. Top {CITED_K} most relevant papers become primary citations, {MENTIONED_K} more become supporting references, and {FURTHER_K} are surfaced as further reading. Embeddings cover {embeddings?.n_papers || 0} papers.
              </p>
            </div>
            {messages.length > 0 && (
              <button
                onClick={reset}
                className="text-xs text-slate-500 hover:text-slate-900 underline"
              >
                Clear conversation
              </button>
            )}
          </div>

          {/* Conversation thread */}
          {messages.length > 0 && (
            <div className="space-y-3 mb-4 max-h-[60vh] overflow-y-auto scrollbar-thin pr-1">
              {messages.map((m, i) => (
                <div key={i} className={`animate-fade ${m.role === 'user' ? '' : ''}`}>
                  {m.role === 'user' ? (
                    <div className="flex justify-end">
                      <div className="bg-slate-900 text-white px-4 py-2 rounded-lg max-w-[85%] text-sm leading-relaxed">
                        {m.text}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="bg-slate-50 border border-slate-200 px-4 py-3 rounded-lg text-sm text-slate-800 serif leading-relaxed">
                        {renderAssistantText(m.text, m.retrieved)}
                      </div>
                      {m.retrieved && (() => {
                        const refs = m.retrieved.filter(r => r.tier === 'cited' || r.tier === 'mentioned');
                        const further = m.retrieved.filter(r => r.tier === 'further');
                        return (
                          <div className="space-y-2">
                            {/* References (cited + mentioned), shown by default */}
                            {refs.length > 0 && (
                              <div>
                                <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5 px-1">
                                  References ({refs.length})
                                </div>
                                <div className="space-y-1">
                                  {refs.map(r => {
                                    const paper = paperById.get(String(r.id));
                                    const isCited = r.tier === 'cited';
                                    return (
                                      <button
                                        key={r.idx}
                                        onClick={() => paper && onPaperClick && onPaperClick(paper)}
                                        className={`block w-full text-left p-2 border rounded transition-colors ${
                                          isCited
                                            ? 'bg-white border-slate-300 hover:border-slate-500 hover:shadow-sm'
                                            : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-slate-400'
                                        }`}
                                      >
                                        <div className="flex items-baseline gap-2">
                                          <span className={`font-mono flex-shrink-0 ${isCited ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>
                                            [{r.idx}]
                                          </span>
                                          <div className="min-w-0 flex-1">
                                            <div className="flex items-baseline gap-2 flex-wrap">
                                              <span className="font-medium text-slate-800">{r.citation}</span>
                                              {isCited && (
                                                <span className="text-[9px] uppercase tracking-wider font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1 py-px rounded">
                                                  primary
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-slate-600 text-[11px] leading-snug">{r.title}</div>
                                          </div>
                                          <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0">
                                            {(r.score * 100).toFixed(0)}%
                                          </span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Further reading, collapsed by default */}
                            {further.length > 0 && (
                              <details className="pt-1">
                                <summary className="cursor-pointer text-[11px] text-slate-500 hover:text-slate-900 px-1 py-1">
                                  Further reading ({further.length}) — related papers you may want to explore
                                </summary>
                                <div className="mt-2 space-y-1">
                                  {further.map((r, i) => {
                                    const paper = paperById.get(String(r.id));
                                    return (
                                      <button
                                        key={i}
                                        onClick={() => paper && onPaperClick && onPaperClick(paper)}
                                        className="block w-full text-left p-2 bg-white border border-dashed border-slate-200 rounded hover:border-slate-400 hover:bg-slate-50 transition-colors"
                                      >
                                        <div className="flex items-baseline gap-2">
                                          <span className="text-slate-300 flex-shrink-0">•</span>
                                          <div className="min-w-0 flex-1">
                                            <div className="font-medium text-slate-700">{r.citation}</div>
                                            <div className="text-slate-500 text-[11px] leading-snug">{r.title}</div>
                                          </div>
                                          <span className="text-[10px] text-slate-400 tabular-nums flex-shrink-0">
                                            {(r.score * 100).toFixed(0)}%
                                          </span>
                                        </div>
                                      </button>
                                    );
                                  })}
                                </div>
                              </details>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="bg-slate-50 border border-slate-200 px-4 py-3 rounded-lg text-sm text-slate-500 italic flex items-center gap-2">
                  <div className="inline-block w-3 h-3 border border-slate-300 border-t-slate-700 rounded-full animate-spin"></div>
                  Searching corpus and generating answer…
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Example questions (only show before first message) */}
          {messages.length === 0 && (
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                Try one of these
              </div>
              <div className="flex flex-wrap gap-1.5">
                {exampleQuestions.map((eq, i) => (
                  <button
                    key={i}
                    onClick={() => setQuestion(eq)}
                    className="text-xs text-left bg-white border border-slate-200 hover:border-slate-400 hover:bg-slate-50 rounded px-2.5 py-1.5 text-slate-700 transition-colors"
                  >
                    {eq}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="flex gap-2 items-end">
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={messages.length === 0 ? "Ask anything about the 148 reviewed papers…" : "Follow up…"}
              rows={2}
              className="flex-1 px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-slate-900 focus:ring-1 focus:ring-slate-900 resize-none"
              disabled={loading || !apiConfigured}
            />
            <button
              onClick={submit}
              disabled={loading || !question.trim() || !apiConfigured}
              className="px-4 py-2 text-sm font-medium bg-slate-900 text-white rounded-md hover:bg-slate-800 transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
            >
              Ask
            </button>
          </div>
          <div className="text-[10px] text-slate-400 mt-2">
            Press Enter to send, Shift+Enter for new line. AI-generated answers may contain errors; verify against cited papers.
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-xs text-red-900">
            <span className="font-semibold">Error:</span>
            <span className="font-mono ml-2 break-words">{error}</span>
          </div>
        )}
      </div>
    );
  };

  window.AppCharts.AIChat = AIChat;
})();
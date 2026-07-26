/* Questions & Answers tab: the practitioner question dictionary built from the
   taxonomy classification (GPT-5.6 Luna over the extracted questions) and the
   pattern consolidation pass (notebook 10).

   Data, both lazy-loaded by app.js the first time this tab opens:
     qa_taxonomy.json  hierarchy (type -> family -> pattern), stats, per-type
                       outcome tiers, top lists, downloads
     qa_records.json   one slim row per extracted question for the browse table */

window.AppQA = (function() {
  const { useState, useMemo, useRef } = React;
  const { Card, StatCard, Chip, CategoryBadge } = window.AppComponents;
  const { formatNumber } = window.AppUtils;

  const youtubeLink = (v, c) => `https://www.youtube.com/watch?v=${v}&lc=${c}`;

  /* ── Static taxonomy presentation metadata ────────────────────────────
     Colors, slot templates, and one-line definitions for the fixed v0
     instrument (Codebook_v0_gpt-5-mini_FROZEN.md). Templates are quoted
     verbatim from the frozen classification prompt; [tokens] are the slots
     the classifier fills per question. */
  const Q_META = {
    Q1:  { color: '#4E79A7', template: 'Can I [action] [component] in [location/condition]?',
           alt: 'Is [practice] allowed [in jurisdiction]?',
           def: 'Asks whether a practice or material is allowed, in general or under a specific jurisdiction.' },
    Q2:  { color: '#F28E2B', template: 'What [size/rating/quantity] [component] for [load/application] at [distance/condition]?',
           alt: null,
           def: 'Asks for a size, rating, or quantity for a given load, run, or application.' },
    Q3:  { color: '#59A14F', template: 'How do you [task] when [constraint]?',
           alt: null,
           def: 'Asks how to carry out a task, often under a complicating constraint.' },
    Q4:  { color: '#B07AA1', template: 'Why or how does [phenomenon] behave this way under [condition]?',
           alt: null,
           def: 'Seeks understanding of how or why something works, including clarifying a claim made in the video.' },
    Q5:  { color: '#E15759', template: 'Why does [system] show [symptom] when [trigger]?',
           alt: 'How do I fix [problem]?',
           def: 'Describes a fault or symptom and asks for its cause or its fix.' },
    Q6:  { color: '#EDC948', template: 'Why did you [observed practice] instead of [alternative]?',
           alt: 'Shouldn’t you have [expected practice]?',
           def: 'Interrogates a choice the creator made, usually implying a correction.' },
    Q7:  { color: '#76B7B2', template: '[Option A] or [Option B] for [use case]?',
           alt: 'What about [alternative] for [context]?',
           def: 'Weighs two or more options, or floats an alternative, for a stated use case.' },
    Q8:  { color: '#FF9DA7', template: 'Is [my plan/work/situation] OK, safe, or compliant?',
           alt: 'Do you see any problem?',
           def: 'Submits the asker’s own specific installation, plan, or situation for assessment.' },
    Q9:  { color: '#9C755F', template: 'What is [item] called?',
           alt: 'Where do I get [item]? How much does [item] cost?',
           def: 'Asks what a tool, part, or material is called, where to buy it, or what it costs.' },
    Q10: { color: '#A0CBE8', template: 'Can you make a video about [subject]?',
           alt: 'Can you share [artifact]?',
           def: 'Asks the creator to produce or share content or artifacts.' },
    Q11: { color: '#BAB0AC', template: null, alt: null,
           def: 'Escape category for questions with no technical substance: jokes, small talk, rhetorical jabs.' },
  };

  // Answer forms carry the same slot templates the classifier used, quoted from
  // the frozen codebook, so each card shows the shape of the reply it names.
  const A_META = {
    A1:  { color: '#047857', def: 'A specific, actionable answer: do X, or yes if a condition holds.',
           templates: ['Use [method/material] for [application].', 'Yes, if [condition] holds; otherwise [alternative].'] },
    A2:  { color: '#059669', def: 'Teaches the mechanism, definition, or rationale rather than instructing.',
           templates: ['[Phenomenon] happens because [mechanism].', '[Term] means [concept] in [context].'] },
    A3:  { color: '#10B981', def: 'Practice-based testimony from personal, regional, or trade experience.',
           templates: ['In my [trade/region/years] experience, [practice] works because [observation].'] },
    A4:  { color: '#34D399', def: 'Invokes the NEC, local code, a listing, or a manufacturer requirement.',
           templates: ['[Code article/standard] requires [rule] for [application].', '[Authority] must approve [practice] in [jurisdiction].'] },
    A5:  { color: '#6EE7B7', def: 'Corrects the asker’s premise, practice, or safety error.',
           templates: ['[Stated premise] is wrong: [correction].', '[Practice] is unsafe because [hazard].'] },
    A6:  { color: '#B45309', def: 'Requests missing details or clarification instead of answering.',
           templates: ['What [detail] are you working with?', 'Can you share [missing information] first?'] },
    A7:  { color: '#D97706', def: 'Points somewhere else that plausibly holds the solution.',
           templates: ['See [video/resource] for [topic].', 'You can get [item] from [source].'] },
    A8:  { color: '#F59E0B', def: 'The creator addresses the video rather than the question.',
           templates: ['I will make a video on [subject].', '[Artifact] is available at [location].'] },
    A9:  { color: '#FBBF24', def: 'Attempts an answer while flagging uncertainty.',
           templates: ['Probably [answer], but I cannot be sure without [missing detail].'] },
    A10: { color: '#94A3B8', def: 'Humor, banter, agreement, or promotion with no answer content.',
           templates: ['[Joke or banter about the situation].', 'Thanks, glad it helped.'] },
  };

  // The two column groups of the answer-form cards: the forms that state an
  // answer, and the forms that engage the question some other way.
  const A_GROUPS = [
    { title: 'Direct answer forms', range: '(A1 to A5)', sub: 'the reply itself states the answer',
      codes: ['A1', 'A2', 'A3', 'A4', 'A5'] },
    { title: 'Indirect reply forms', range: '(A6 to A10)', sub: 'the reply points elsewhere, defers, hedges, or does not answer',
      codes: ['A6', 'A7', 'A8', 'A9', 'A10'] },
  ];

  const Q_ORDER = ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'Q8', 'Q9', 'Q10'];

  // Hatch pattern per question type; the five patterns repeat across the ten hues
  // so neighboring segments stay distinguishable without relying on color alone.
  const Q_HATCH = {
    Q1: 'none', Q2: 'forward', Q3: 'dots', Q4: 'cross', Q5: 'back',
    Q6: 'none', Q7: 'forward', Q8: 'dots', Q9: 'cross', Q10: 'back',
  };

  // Mix the hue toward white for segment fills; f is the share of hue kept.
  const blendWhite = (hex, f) => {
    const ch = (i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f + 255 * (1 - f));
    return `rgb(${ch(1)}, ${ch(3)}, ${ch(5)})`;
  };
  // Darken the hue for percentage labels sitting above their own segment.
  const darken = (hex, f) => {
    const ch = (i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * f);
    return `rgb(${ch(1)}, ${ch(3)}, ${ch(5)})`;
  };

  // Muted fill plus the hatch overlay for one question type's bar segment.
  function segStyle(code) {
    const hue = qColor(code);
    const base = { backgroundColor: blendWhite(hue, 0.55) };
    const forward = `repeating-linear-gradient(45deg, ${hue} 0 1px, transparent 1px 4px)`;
    const back = `repeating-linear-gradient(-45deg, ${hue} 0 1px, transparent 1px 4px)`;
    const kind = Q_HATCH[code];
    if (kind === 'forward') return { ...base, backgroundImage: forward };
    if (kind === 'back') return { ...base, backgroundImage: back };
    if (kind === 'cross') return { ...base, backgroundImage: `${forward}, ${back}` };
    if (kind === 'dots') return { ...base, backgroundImage: `radial-gradient(${hue} 0.8px, transparent 0.9px)`, backgroundSize: '4px 4px' };
    return base;
  }

  // Reply-outcome tier colors, shared by the funnel, the per-type chart,
  // the type cards, and the legend.
  const TIER = {
    answered:          { color: '#059669', label: 'Answered' },
    repliedUnanswered: { color: '#F59E0B', label: 'Replied, no answer' },
    neverReplied:      { color: '#CBD5E1', label: 'Never replied' },
  };

  const qColor = (code) => (Q_META[code] || {}).color || '#94A3B8';
  const aColor = (code) => (A_META[code] || {}).color || '#94A3B8';

  /* ── Small shared pieces ─────────────────────────────────────────────── */

  // Section heading outside a Card: small eyebrow, serif title, plain subtitle.
  function SectionHeader({ eyebrow, title, subtitle }) {
    return (
      <div className="space-y-1">
        {eyebrow && <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">{eyebrow}</div>}
        <h2 className="serif text-xl font-semibold text-slate-900">{title}</h2>
        {subtitle && <p className="text-sm text-slate-500 leading-relaxed max-w-3xl">{subtitle}</p>}
      </div>
    );
  }

  // Colored square + label, used to explain the outcome tier colors.
  const LegendDot = ({ color, label }) => (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
      {label}
    </span>
  );

  // One segment of a horizontal stacked outcome bar. Prints its own
  // percentage when it is wide enough to hold the text; noLabel bars
  // (the thin ones) stay clean.
  function Seg({ value, total, color, title, darkText, noLabel }) {
    if (!value || value <= 0) return null;
    const pct = (100 * value) / total;
    return (
      <div
        className="h-full flex items-center justify-center overflow-hidden"
        style={{ width: pct + '%', backgroundColor: color }}
        title={title}
      >
        {!noLabel && pct >= 6 && (
          <span className={`text-[10px] tabular-nums font-medium whitespace-nowrap ${darkText ? 'text-slate-600' : 'text-white'}`}>
            {Math.round(pct)}%
          </span>
        )}
      </div>
    );
  }

  // Renders a slot template string, highlighting each [slot] token on the
  // question type's color so the template structure reads at a glance.
  function TemplateText({ text, color }) {
    const parts = String(text).split(/(\[[^\]]+\])/g);
    return (
      <span className="font-mono text-[11px] leading-relaxed">
        {parts.map((p, i) =>
          p.startsWith('[')
            ? <span key={i} className="px-1 py-px rounded text-slate-800 whitespace-nowrap" style={{ backgroundColor: color + '33' }}>{p}</span>
            : <span key={i} className="text-slate-500">{p}</span>
        )}
      </span>
    );
  }

  // Small outcome badge for a single question's reply status.
  function OutcomeBadge({ answered, replyCount }) {
    if (answered) {
      return <span className="text-[11px] px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">answered</span>;
    }
    if (Number(replyCount) > 0) {
      return <span className="text-[11px] px-2 py-0.5 rounded-md bg-amber-50 text-amber-700 border border-amber-200">replied, unanswered</span>;
    }
    return <span className="text-[11px] px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 border border-slate-200">never replied</span>;
  }

  // Tiny inline chips for the answer type codes attached to a record.
  function AnswerTypeChips({ codes }) {
    const list = String(codes || '').split(';').map((c) => c.trim()).filter(Boolean);
    if (!list.length) return null;
    return (
      <span className="inline-flex items-center gap-1">
        {list.map((c) => (
          <span key={c} className="text-[10px] px-1 py-px rounded font-medium text-slate-700"
                style={{ backgroundColor: aColor(c) + '33' }} title={c}>
            {c}
          </span>
        ))}
      </span>
    );
  }

  /* ── Hero: what this tab is, and how the dictionary is organized ─────── */

  function Hero({ qa }) {
    const s = qa.stats;
    const tiers = (n, label, note) => (
      <div className="flex-1 min-w-[7.5rem] bg-white/80 border border-slate-200 rounded-lg px-3 py-2.5 text-center">
        <div className="serif text-xl font-semibold text-slate-900 tabular-nums leading-none">{formatNumber(n)}</div>
        <div className="text-[11px] font-medium text-slate-700 mt-1">{label}</div>
        <div className="text-[10px] text-slate-400">{note}</div>
      </div>
    );
    const arrow = <span className="text-slate-300 text-lg flex-shrink-0 hidden sm:block">→</span>;
    return (
      <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="absolute inset-0 kb-hero-grid pointer-events-none" />
        <div className="absolute inset-0 kb-hero-glow pointer-events-none" />
        <div className="relative px-6 py-8 sm:px-8 space-y-6">
          <div className="max-w-3xl space-y-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">The practitioner question dictionary</div>
            <h2 className="serif text-2xl sm:text-3xl font-semibold text-slate-900 leading-tight">
              What the trade asks, and what the internet answers
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Every substantive question extracted from the comment sections of the analyzed
              electrical construction videos, classified into a fixed taxonomy of question forms,
              consolidated into recurring patterns, and paired with the replies each one received.
              The goal is to locate the knowledge bottleneck: the questions practitioners keep
              asking that nobody answers.
            </p>
          </div>
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold">How the dictionary is organized</div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {tiers(qa.questionTypes.length, 'Question types', 'fixed intent forms')}
              {arrow}
              {tiers(s.questionFamilies, 'Families', 'thematic groups')}
              {arrow}
              {tiers(s.questionPatterns, 'Patterns', 'recurring asks')}
              {arrow}
              {tiers(s.consolidatedQuestions, 'Questions', 'individual comments')}
            </div>
            <p className="text-[11px] text-slate-400">
              The reply side mirrors it: ten answer forms (A1 to A10) type all {formatNumber(s.repliedTyped)} replies
              these questions received, and {formatNumber(s.answerFamilies)} families and {formatNumber(s.answerPatterns)} patterns
              consolidate the {formatNumber(s.consolidatedAnswers)} of those replies that carried a solution.
              Every tier traces back to real, linkable comments.
            </p>
          </div>
        </div>
      </div>
    );
  }

  /* ── Funnel: the two-tier answer bottleneck ──────────────────────────── */

  function Funnel({ s }) {
    const total = s.eligibleQuestions || 1;
    const pctNever = Math.round((1000 * s.neverReplied) / total) / 10;
    const pctReplied = Math.round((1000 * s.replied) / total) / 10;
    const pctAnswered = Math.round((1000 * s.answered) / total) / 10;
    const lostInReplies = s.replied - s.answered;

    const stage = (label, n, pct, color, darkText) => (
      <div className="flex items-center gap-3">
        <div className="w-40 sm:w-52 text-xs text-slate-700 leading-snug flex-shrink-0 text-right">{label}</div>
        <div className="flex-1 h-9 bg-slate-50 rounded-md overflow-hidden">
          <div className="h-full rounded-md flex items-center px-3 gap-2 min-w-fit transition-all"
               style={{ width: pct + '%', backgroundColor: color }}>
            <span className={`text-xs font-semibold tabular-nums whitespace-nowrap ${darkText ? 'text-slate-700' : 'text-white'}`}>
              {formatNumber(n)}
            </span>
            <span className={`text-[10px] tabular-nums whitespace-nowrap ${darkText ? 'text-slate-500' : 'text-white/80'}`}>
              {pct}%
            </span>
          </div>
        </div>
      </div>
    );

    const drop = (text) => (
      <div className="flex items-center gap-3">
        <div className="w-40 sm:w-52 flex-shrink-0" />
        <div className="flex-1 text-[11px] text-rose-600 pl-3">↳ {text}</div>
      </div>
    );

    return (
      <div className="space-y-4">
        <div className="space-y-1.5">
          {stage('Substantive questions asked', s.eligibleQuestions, 100, '#334155', false)}
          {drop(`${formatNumber(s.neverReplied)} questions (${pctNever}%) never receive a single reply`)}
          {stage('Receive at least one reply', s.replied, pctReplied, '#F59E0B', false)}
          {drop(`${formatNumber(lostInReplies)} replied threads never produce an actual answer`)}
          {stage('Receive an actual answer', s.answered, pctAnswered, '#059669', false)}
        </div>
        <div className="grid md:grid-cols-2 gap-3 text-xs leading-relaxed">
          <div className="border-l-4 rounded-r-md bg-rose-50/60 border-rose-400 px-4 py-3 text-slate-700">
            <span className="font-semibold text-rose-700">Silence is the dominant failure mode. </span>
            {pctNever}% of substantive questions never receive a single reply of any kind. That is
            the largest observed loss of knowledge transfer in the dataset.
          </div>
          <div className="border-l-4 rounded-r-md bg-emerald-50/60 border-emerald-400 px-4 py-3 text-slate-700">
            <span className="font-semibold text-emerald-700">When someone engages, answers usually follow. </span>
            Among questions that got any reply at all, {s.answerRateReplied}% received a genuine
            answer. The observed gap sits in questions that never draw a response, not in replies
            that fail to answer.
          </div>
        </div>
      </div>
    );
  }

  /* ── Question type template cards ────────────────────────────────────── */

  function TypeCard({ code, name, outcome, eligible, onOpen }) {
    const meta = Q_META[code] || {};
    const share = outcome ? Math.round((1000 * outcome.total) / eligible) / 10 : null;
    return (
      <button
        onClick={onOpen}
        className="text-left bg-white border border-slate-200 rounded-lg p-4 space-y-2.5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer w-full"
        style={{ borderTop: `3px solid ${meta.color}` }}
        title={`Open ${code} in the dictionary browser`}
      >
        <div className="flex items-center gap-2 flex-wrap">
          <CategoryBadge code={code} color={meta.color} />
          <span className="text-sm font-semibold text-slate-900 leading-snug">{name}</span>
        </div>
        <p className="text-xs text-slate-600 leading-relaxed">{meta.def}</p>
        {meta.template && (
          <div className="bg-slate-50 rounded-md px-2.5 py-2 space-y-1">
            <div><TemplateText text={meta.template} color={meta.color} /></div>
            {meta.alt && <div><TemplateText text={meta.alt} color={meta.color} /></div>}
          </div>
        )}
        {outcome && (
          <div className="space-y-1.5 pt-0.5">
            <div className="flex h-1.5 rounded-full overflow-hidden bg-slate-100">
              <Seg value={outcome.answered} total={outcome.total} color={TIER.answered.color}
                   title={`Answered: ${formatNumber(outcome.answered)}`} noLabel />
              <Seg value={outcome.repliedUnanswered} total={outcome.total} color={TIER.repliedUnanswered.color}
                   title={`Replied without answer: ${formatNumber(outcome.repliedUnanswered)}`} noLabel />
              <Seg value={outcome.neverReplied} total={outcome.total} color={TIER.neverReplied.color}
                   title={`Never replied: ${formatNumber(outcome.neverReplied)}`} noLabel />
            </div>
            <div className="flex items-baseline justify-between text-[11px] text-slate-500">
              <span className="tabular-nums">{formatNumber(outcome.total)} questions · {share}% of dataset</span>
              {outcome.answerRateReplied !== null && (
                <span className="tabular-nums">{outcome.answerRateReplied}% answered when replied</span>
              )}
            </div>
          </div>
        )}
      </button>
    );
  }

  /* ── Bottleneck by question type: sorted stacked bars ────────────────── */

  function BottleneckChart({ outcomes, stats }) {
    const [sortKey, setSortKey] = useState('leastAnswered');
    const sorted = useMemo(() => {
      const rows = [...outcomes];
      if (sortKey === 'volume') rows.sort((a, b) => b.total - a.total);
      else if (sortKey === 'replyRate') rows.sort((a, b) => a.replyRate - b.replyRate);
      else rows.sort((a, b) => (a.answered / a.total) - (b.answered / b.total));
      return rows;
    }, [outcomes, sortKey]);

    const row = (o, label, badgeColor, isTotal) => (
      <div key={o.code || 'total'} className={`flex items-center gap-3 ${isTotal ? 'pt-2 mt-1 border-t border-slate-200' : ''}`}>
        <div className="w-40 sm:w-56 flex items-center gap-2 flex-shrink-0 min-w-0">
          {o.code
            ? <CategoryBadge code={o.code} color={badgeColor} />
            : <span className="text-[11px] px-2 py-0.5 rounded-md font-semibold bg-slate-800 text-white">All</span>}
          <span className={`text-xs truncate ${isTotal ? 'font-semibold text-slate-900' : 'text-slate-700'}`} title={label}>{label}</span>
        </div>
        <div className="flex-1 h-6 rounded-md overflow-hidden flex bg-slate-100">
          <Seg value={o.answered} total={o.total} color={TIER.answered.color}
               title={`Answered: ${formatNumber(o.answered)} (${Math.round(100 * o.answered / o.total)}%)`} />
          <Seg value={o.repliedUnanswered} total={o.total} color={TIER.repliedUnanswered.color}
               title={`Replied without answer: ${formatNumber(o.repliedUnanswered)} (${Math.round(100 * o.repliedUnanswered / o.total)}%)`} />
          <Seg value={o.neverReplied} total={o.total} color={TIER.neverReplied.color}
               title={`Never replied: ${formatNumber(o.neverReplied)} (${Math.round(100 * o.neverReplied / o.total)}%)`} darkText />
        </div>
        <div className="w-24 sm:w-32 text-right flex-shrink-0">
          <div className="text-xs text-slate-700 tabular-nums">{formatNumber(o.total)}</div>
          <div className="text-[10px] text-slate-400 tabular-nums">
            {o.answerRateReplied !== null ? `${o.answerRateReplied}% when replied` : ''}
          </div>
        </div>
      </div>
    );

    const totalRow = {
      total: stats.eligibleQuestions, answered: stats.answered,
      repliedUnanswered: stats.replied - stats.answered, neverReplied: stats.neverReplied,
      answerRateReplied: stats.answerRateReplied,
    };

    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-4">
            <LegendDot color={TIER.answered.color} label={TIER.answered.label} />
            <LegendDot color={TIER.repliedUnanswered.color} label={TIER.repliedUnanswered.label} />
            <LegendDot color={TIER.neverReplied.color} label={TIER.neverReplied.label} />
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400 mr-1">Sort by</span>
            <Chip active={sortKey === 'leastAnswered'} onClick={() => setSortKey('leastAnswered')}>Least answered</Chip>
            <Chip active={sortKey === 'replyRate'} onClick={() => setSortKey('replyRate')}>Least replied</Chip>
            <Chip active={sortKey === 'volume'} onClick={() => setSortKey('volume')}>Volume</Chip>
          </div>
        </div>
        <div className="space-y-1.5">
          {sorted.map((o) => row(o, o.name, qColor(o.code), false))}
          {row(totalRow, 'All question types', null, true)}
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          Bars show the share of each type&rsquo;s questions in each reply outcome. The right column is the
          type&rsquo;s question count and its answer rate among questions that received at least one reply.
          A question counts as answered when a reply in its thread actually carries a solution, as judged
          in the original GPT-5-mini pass that extracted the question and answer structure.
        </p>
      </div>
    );
  }

  /* ── Answer form cards (A1 to A5 vs A6 to A10) ───────────────────────── */

  // One card per answer form: code badge, name, definition, reply count and
  // share, the slot templates that form takes, a bar showing which question
  // types it responds to, and a meter for its resolution rate.
  function AnswerFormCard({ t, total, qTypeNames, onOpen }) {
    const meta = A_META[t.code] || {};
    const share = total ? ((100 * t.replies) / total).toFixed(1) : '0.0';
    const resolution = t.replies ? Math.round((100 * t.solved) / t.replies) : 0;
    const mix = Q_ORDER.map((q) => [q, (t.mix || {})[q] || 0]).filter(([, n]) => n > 0);
    return (
      <button
        onClick={onOpen}
        className="text-left w-full bg-white border border-slate-300 rounded-lg p-4 flex flex-col gap-3 transition duration-200 hover:border-slate-400 hover:shadow-md cursor-pointer"
        title={`Open ${t.code} in the dictionary browser`}
      >
        {/* header: badge, name, definition, and the reply count this form carries */}
        <p className="text-xs leading-relaxed text-slate-700">
          <span className="align-middle mr-1.5"><CategoryBadge code={t.code} color="#64748B" /></span>
          <span className="font-semibold text-slate-900">{t.name}: </span>
          <span className="italic">{meta.def} </span>
          <span className="text-slate-500 not-italic">({formatNumber(t.replies)} replies, {share}%)</span>
        </p>

        {/* the slot templates a reply of this form fills */}
        <div className="bg-slate-50 rounded-md px-2.5 py-2 space-y-1">
          {(meta.templates || []).map((tpl, i) => (
            <div key={i} className="flex gap-1.5">
              <span className="text-slate-400 flex-shrink-0 text-[11px] leading-relaxed">•</span>
              <TemplateText text={tpl} color="#64748B" />
            </div>
          ))}
        </div>

        <div className="mt-auto space-y-1.5">
          {/* question types this form responds to, percentage above each wide segment */}
          <div className="flex h-3 items-end gap-px" aria-hidden="true">
            {mix.map(([q, n]) => {
              const pct = Math.round((100 * n) / t.replies);
              return (
                <span key={q} className="flex items-end justify-center overflow-hidden"
                      style={{ width: (100 * n) / t.replies + '%' }}>
                  {pct >= 5 && (
                    <span className="text-[9px] tabular-nums leading-none whitespace-nowrap"
                          style={{ color: darken(qColor(q), 0.62) }}>{pct}%</span>
                  )}
                </span>
              );
            })}
          </div>
          <div className="flex h-2.5 overflow-hidden rounded-sm">
            {mix.map(([q, n]) => (
              <span key={q} style={{ width: (100 * n) / t.replies + '%', ...segStyle(q) }}
                    title={`${q} ${qTypeNames[q] || ''}: ${formatNumber(n)} questions (${Math.round((100 * n) / t.replies)}%)`} />
            ))}
          </div>

          {/* resolution rate: the share of this form's questions that ended solved */}
          <div className="flex items-center gap-2 pt-1"
               title={`${formatNumber(t.solved)} of ${formatNumber(t.replies)} questions answered by this form ended with a solution`}>
            <span className="h-1.5 w-24 bg-slate-200 overflow-hidden flex-shrink-0 rounded-sm">
              <span className="block h-full bg-slate-600" style={{ width: resolution + '%' }} />
            </span>
            <span className="text-[11px] text-slate-600 tabular-nums">{resolution}% resolution rate</span>
          </div>
        </div>
      </button>
    );
  }

  // Q1 to Q10 swatch legend shared by all ten cards, plus the reading notes.
  function AnswerFormLegend({ qTypeNames }) {
    return (
      <div className="space-y-3 pt-1">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-4 gap-y-1.5">
          {Q_ORDER.map((q) => (
            <span key={q} className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 leading-snug">
              <span className="w-3.5 h-3 flex-shrink-0 rounded-sm border"
                    style={{ ...segStyle(q), borderColor: qColor(q) }} />
              <span>{q} {qTypeNames[q]}</span>
            </span>
          ))}
        </div>
        <div className="text-[11px] text-slate-400 leading-relaxed space-y-0.5">
          <p>Bar segments show the question types each reply form responds to. The meter gives the resolution rate of those questions.</p>
          <p>Each question is counted once, under the form of its dominant reply.</p>
        </div>
      </div>
    );
  }

  /* ── Top pattern bar (ranked lists) ──────────────────────────────────── */

  function PatternBar({ rank, type, text, count, max, sub, color }) {
    const pct = Math.max(2, Math.round((count / max) * 100));
    return (
      <div className="space-y-1">
        <div className="flex items-baseline gap-2 text-xs">
          <span className="text-slate-400 tabular-nums w-5 flex-shrink-0 text-right">{rank}.</span>
          <CategoryBadge code={type} color={color} />
          <span className="text-slate-800 flex-1 leading-snug">{text}</span>
          <span className="text-slate-500 tabular-nums flex-shrink-0">{formatNumber(count)}</span>
        </div>
        <div className="ml-7 h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: pct + '%', backgroundColor: color }} />
        </div>
        {sub && <div className="ml-7 text-[11px] text-slate-400">{sub}</div>}
      </div>
    );
  }

  /* ── Dictionary browser internals ────────────────────────────────────── */

  // One pattern row inside the dictionary browser; expands to show examples.
  function PatternRow({ pattern, isQuestion }) {
    const [open, setOpen] = useState(false);
    return (
      <div className="border border-slate-100 rounded-md">
        <button
          onClick={() => setOpen(!open)}
          className="w-full text-left px-3 py-2 flex items-baseline gap-2 hover:bg-slate-50"
        >
          <span className="text-slate-400 text-[10px] flex-shrink-0">{open ? '▾' : '▸'}</span>
          <span className="text-xs text-slate-800 flex-1 leading-snug">{pattern.text}</span>
          <span className="text-[11px] text-slate-500 tabular-nums flex-shrink-0">{formatNumber(pattern.count)}</span>
        </button>
        {open && (
          <div className="px-3 pb-3 space-y-2 border-t border-slate-100 pt-2">
            {isQuestion && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                <span className="text-slate-500">never replied <span className="tabular-nums font-medium">{formatNumber(pattern.neverReplied)}</span></span>
                <span className="text-amber-700">replied <span className="tabular-nums font-medium">{formatNumber(pattern.replied)}</span></span>
                <span className="text-emerald-700">answered <span className="tabular-nums font-medium">{formatNumber(pattern.answered)}</span></span>
                {pattern.answerRate !== null && (
                  <span className="text-slate-500">answer rate among replied <span className="tabular-nums font-medium">{pattern.answerRate}%</span></span>
                )}
              </div>
            )}
            {(pattern.examples || []).map((ex) => (
              <div key={ex.c} className="bg-slate-50 rounded-md p-2.5 text-xs space-y-1">
                <p className="text-slate-800 leading-snug">{ex.q}</p>
                {ex.a && <p className="text-emerald-800 leading-snug"><span className="font-medium">Answer: </span>{ex.a}</p>}
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span>{ex.rc} {Number(ex.rc) === 1 ? 'reply' : 'replies'}</span>
                  <a className="text-slate-500 hover:text-slate-900 underline" target="_blank" rel="noopener"
                     href={youtubeLink(ex.v, ex.c)}>View on YouTube</a>
                </div>
              </div>
            ))}
            <div className="text-[10px] text-slate-400">{pattern.id}</div>
          </div>
        )}
      </div>
    );
  }

  // Every reply of one answer form, paged and searchable. The consolidated
  // families above a form cover only the replies that carried a solution, so
  // this is where the rest of that form's records live: each one shows either
  // the answer that solved it or a summary of what its replies did instead.
  function FormRecords({ code, rows }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(0);
    const PAGE = 25;

    const filtered = useMemo(() => {
      const q = query.trim().toLowerCase();
      if (!q) return rows;
      return rows.filter((r) => r.questionExcerpt.toLowerCase().includes(q)
        || String(r.canonical || '').toLowerCase().includes(q)
        || String(r.answerExcerpt || '').toLowerCase().includes(q)
        || String(r.replySummary || '').toLowerCase().includes(q));
    }, [rows, query]);

    const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE));
    const shown = filtered.slice(page * PAGE, page * PAGE + PAGE);

    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-slate-50/50">
        <button onClick={() => setOpen(!open)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-100/70">
          <span className="text-slate-400 text-xs flex-shrink-0">{open ? '▾' : '▸'}</span>
          <span className="flex-1 min-w-0">
            <span className="text-sm font-medium text-slate-900">Every question answered by {code}</span>
            <span className="block text-[11px] text-slate-500 mt-0.5">
              All {formatNumber(rows.length)} records of this form, including the replies that carried no solution
            </span>
          </span>
          <span className="text-[11px] text-slate-500 tabular-nums flex-shrink-0">{formatNumber(rows.length)} records</span>
        </button>
        {open && (
          <div className="px-4 pb-3 pt-2 border-t border-slate-200 space-y-3 bg-white">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); setPage(0); }}
              placeholder="Search these questions and replies…"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
            />
            <p className="text-[11px] text-slate-500">{formatNumber(filtered.length)} records match</p>
            <div className="divide-y divide-slate-100">
              {shown.map((r) => (
                <div key={r.commentId} className="py-3 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <p className="text-xs text-slate-800 leading-snug flex-1">{r.questionExcerpt}</p>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <CategoryBadge code={r.primaryType} color={qColor(r.primaryType)} />
                      <OutcomeBadge answered={r.answered} replyCount={r.replyCount} />
                    </div>
                  </div>
                  {r.canonical && <p className="text-[11px] text-slate-500 leading-snug italic">{r.canonical}</p>}
                  {r.answerExcerpt
                    ? <p className="text-[11px] text-emerald-800 leading-snug"><span className="font-medium">Answer: </span>{r.answerExcerpt}</p>
                    : r.replySummary
                      ? <p className="text-[11px] text-slate-500 leading-snug"><span className="font-medium">What the replies did: </span>{r.replySummary}</p>
                      : null}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                    <span>{r.replyCount} {Number(r.replyCount) === 1 ? 'reply' : 'replies'}</span>
                    {r.answerTypes && <AnswerTypeChips codes={r.answerTypes} />}
                    <a className="text-slate-500 hover:text-slate-900 underline" target="_blank" rel="noopener"
                       href={youtubeLink(r.videoId, r.commentId)}>View on YouTube</a>
                  </div>
                </div>
              ))}
              {!shown.length && <p className="text-xs text-slate-500 py-3">No records match that search.</p>}
            </div>
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <button disabled={page === 0} onClick={() => setPage(page - 1)}
                      className="px-3 py-1.5 border border-slate-200 rounded-md disabled:opacity-40 hover:bg-slate-50">Previous</button>
              <span className="tabular-nums">Page {page + 1} of {formatNumber(pageCount)}</span>
              <button disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}
                      className="px-3 py-1.5 border border-slate-200 rounded-md disabled:opacity-40 hover:bg-slate-50">Next</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Family accordion: label, answer-rate bar, stats line, member patterns.
  function FamilyBlock({ family, isQuestion, accentColor }) {
    const [open, setOpen] = useState(false);
    const noun = isQuestion ? 'questions' : 'answers';
    return (
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <button onClick={() => setOpen(!open)} className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-slate-50">
          <span className="text-slate-400 text-xs flex-shrink-0">{open ? '▾' : '▸'}</span>
          <span className="flex-1 min-w-0">
            <span className="text-sm font-medium text-slate-900">{family.label}</span>
            {family.description && <span className="block text-[11px] text-slate-500 mt-0.5">{family.description}</span>}
          </span>
          <span className="text-right flex-shrink-0">
            <span className="block text-[11px] text-slate-500 tabular-nums">
              {formatNumber(family.count)} {noun} · {family.patternCount} patterns
            </span>
            {isQuestion && family.answerRate !== null && (
              <span className="inline-flex items-center gap-1.5 mt-1">
                <span className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden inline-block">
                  <span className="block h-full rounded-full" style={{ width: Math.min(100, family.answerRate) + '%', backgroundColor: TIER.answered.color }} />
                </span>
                <span className="text-[10px] text-slate-400 tabular-nums">{family.answerRate}% answered when replied</span>
              </span>
            )}
          </span>
        </button>
        {open && (
          <div className="px-4 pb-3 space-y-1.5 border-t border-slate-100 pt-2"
               style={{ boxShadow: `inset 3px 0 0 ${accentColor}` }}>
            {family.patterns.map((p) => <PatternRow key={p.id} pattern={p} isQuestion={isQuestion} />)}
          </div>
        )}
      </div>
    );
  }

  /* ── The tab ─────────────────────────────────────────────────────────── */

  function QATab({ state, loading }) {
    const qa = state.qaTaxonomy;
    const recordsDoc = state.qaRecords;

    const [kind, setKind] = useState('question');
    const [typeCode, setTypeCode] = useState(null);
    const [dictSearch, setDictSearch] = useState('');
    const [recSearch, setRecSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [recType, setRecType] = useState('all');
    const [page, setPage] = useState(0);
    const PAGE = 25;

    const dictRef = useRef(null);
    const funnelRef = useRef(null);
    const taxRef = useRef(null);
    const botRef = useRef(null);
    const ansRef = useRef(null);
    const patRef = useRef(null);
    const recRef = useRef(null);
    const dlRef = useRef(null);

    const scrollTo = (ref) => ref.current && ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Open one question or answer type in the dictionary browser and scroll to it.
    const openType = (code, side) => {
      setKind(side || 'question');
      setTypeCode(code);
      setDictSearch('');
      scrollTo(dictRef);
    };

    // Convert the column-array record rows into objects once, then keep only the
    // eligible (substantive) population the rest of the tab reports on: primary
    // type is not Q11 and the canonical restatement is non-blank. This is the
    // same 12,933-row predicate behind the funnel; the excluded Q11 rows stay in
    // the downloadable database.
    const records = useMemo(() => {
      if (!recordsDoc) return null;
      const cols = recordsDoc.columns;
      return recordsDoc.rows
        .map((row) => {
          const r = {};
          cols.forEach((c, i) => { r[c] = row[i]; });
          return r;
        })
        .filter((r) => r.primaryType !== 'Q11' && String(r.canonical || '').trim() !== '');
    }, [recordsDoc]);

    // Records grouped by the answer form of their dominant reply, which is the
    // first code listed. These are the populations the answer form cards count.
    const recordsByForm = useMemo(() => {
      if (!records) return null;
      const out = {};
      records.forEach((r) => {
        if (Number(r.replyCount) <= 0) return;
        const form = String(r.answerTypes || '').split(';')[0].trim();
        if (!form) return;
        (out[form] = out[form] || []).push(r);
      });
      return out;
    }, [records]);

    // Counts for the record status filter chips.
    const statusCounts = useMemo(() => {
      if (!records) return null;
      let answered = 0, repliedUn = 0, never = 0;
      records.forEach((r) => {
        if (r.answered) answered++;
        else if (Number(r.replyCount) > 0) repliedUn++;
        else never++;
      });
      return { all: records.length, answered, repliedUn, never };
    }, [records]);

    const filteredRecords = useMemo(() => {
      if (!records) return [];
      const q = recSearch.trim().toLowerCase();
      return records.filter((r) => {
        if (status === 'answered' && !r.answered) return false;
        if (status === 'unanswered' && (r.answered || Number(r.replyCount) === 0)) return false;
        if (status === 'ignored' && Number(r.replyCount) !== 0) return false;
        if (recType !== 'all' && r.primaryType !== recType) return false;
        if (q && !(r.questionExcerpt.toLowerCase().includes(q) || r.canonical.toLowerCase().includes(q))) return false;
        return true;
      });
    }, [records, recSearch, status, recType]);

    if (loading || !qa) {
      return (
        <div className="py-16 text-center">
          <div className="inline-block w-6 h-6 border-2 border-slate-300 border-t-slate-700 rounded-full animate-spin mb-3"></div>
          <p className="text-sm text-slate-500">Loading question dictionary…</p>
        </div>
      );
    }

    const s = qa.stats;
    const qTypeNames = qa.meta.questionTypeNames || {};
    const outcomes = qa.typeOutcomes || [];
    const outcomeByCode = Object.fromEntries(outcomes.map((o) => [o.code, o]));
    const answerTypeByCode = Object.fromEntries(qa.answerTypes.map((t) => [t.code, t]));
    const types = kind === 'question' ? qa.questionTypes : qa.answerTypes;
    const activeTypes = typeCode ? types.filter((t) => t.code === typeCode) : types;
    const dictQuery = dictSearch.trim().toLowerCase();
    const searchHits = dictQuery
      ? types.flatMap((t) => t.families.flatMap((f) => f.patterns
          .filter((p) => p.text.toLowerCase().includes(dictQuery) || f.label.toLowerCase().includes(dictQuery))
          .map((p) => ({ ...p, typeCode: t.code, family: f.label }))))
      : null;
    const topQ = qa.topQuestionPatterns.slice(0, 12);
    const topA = qa.topAnswerPatterns.slice(0, 12);
    const maxQ = Math.max(1, ...topQ.map((p) => p.count));
    const maxA = Math.max(1, ...topA.map((p) => p.count));
    const contrast = qa.contrast || {};
    const pageCount = Math.max(1, Math.ceil(filteredRecords.length / PAGE));
    const pageRows = filteredRecords.slice(page * PAGE, page * PAGE + PAGE);
    const badgeColor = kind === 'question' ? qColor : aColor;

    const jump = [
      ['The funnel', funnelRef], ['The taxonomy', taxRef], ['Bottlenecks by type', botRef],
      ['Answer forms', ansRef], ['Common patterns', patRef], ['The dictionary', dictRef],
      ['Every question', recRef], ['Downloads', dlRef],
    ];

    return (
      <div className="py-8 space-y-10">

        <Hero qa={qa} />

        {/* In-page navigation */}
        <div className="flex flex-wrap items-center gap-1.5 -mt-4">
          <span className="text-[11px] text-slate-400 mr-1">Jump to</span>
          {jump.map(([label, ref]) => (
            <button key={label} onClick={() => scrollTo(ref)}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50 transition-colors">
              {label}
            </button>
          ))}
        </div>

        {/* Headline numbers */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Substantive questions" value={s.eligibleQuestions} />
          <StatCard label="Never receive a reply" value={s.eligibleQuestions ? (100 * s.neverReplied / s.eligibleQuestions).toFixed(1) + '%' : '0%'}
                    hint={`${formatNumber(s.neverReplied)} of ${formatNumber(s.eligibleQuestions)} substantive questions`} />
          <StatCard label="Answered when replied" value={`${s.answerRateReplied || 0}%`}
                    hint={`${formatNumber(s.answered)} answered of ${formatNumber(s.replied)} replied`} />
          <StatCard label="Question patterns" value={s.questionPatterns} hint={`${formatNumber(s.questionFamilies)} families`} />
          <StatCard label="Answer patterns" value={s.answerPatterns} hint={`${formatNumber(s.answerFamilies)} families`} />
        </div>

        {/* The two-tier funnel */}
        <div ref={funnelRef} className="scroll-mt-20 space-y-4">
          <SectionHeader
            eyebrow="The central finding"
            title="Where questions go unanswered"
            subtitle={`Reply outcomes for the ${formatNumber(s.eligibleQuestions)} substantive questions. Social and rhetorical comments (type Q11) are excluded.`}
          />
          <Card><Funnel s={s} /></Card>
        </div>

        {/* The question taxonomy */}
        <div ref={taxRef} className="scroll-mt-20 space-y-4">
          <SectionHeader
            eyebrow="The instrument"
            title="Ten forms of question"
            subtitle="Every question is typed by the form of the ask, not its subject matter. Each type carries a slot template; the classifier restates each real question in its primary type's template so that two people asking the same thing produce nearly the same sentence. Click a card to open that type in the dictionary."
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {qa.questionTypes.map((t) => (
              <TypeCard key={t.code} code={t.code} name={t.name || qTypeNames[t.code]}
                        outcome={outcomeByCode[t.code]} eligible={s.eligibleQuestions}
                        onOpen={() => openType(t.code)} />
            ))}
          </div>
        </div>

        {/* Bottleneck by type */}
        {outcomes.length > 0 && (
          <div ref={botRef} className="scroll-mt-20 space-y-4">
            <SectionHeader
              eyebrow="Bottleneck localization"
              title="Which question types hit the bottleneck"
              subtitle="Reply outcomes per question type. The types at the top are where the most asked-and-never-solved knowledge sits."
            />
            <Card><BottleneckChart outcomes={outcomes} stats={s} /></Card>
          </div>
        )}

        {/* Answer mechanisms */}
        <div ref={ansRef} className="scroll-mt-20 space-y-4">
          <SectionHeader
            eyebrow="The reply side"
            title="How the crowd answers"
            subtitle={`What the ${formatNumber(s.repliedTyped)} replies to substantive questions actually do, counted once per question under the form of its dominant reply. Every reply carries a form whether or not it solves the question, so the five direct answer forms (A1 to A5) and the five indirect reply forms (A6 to A10) are both shown at full size. ${formatNumber(s.answered)} of the ${formatNumber(s.replied)} replied questions were solved, and ${s.repliedUntyped} replies could not be assigned a form. Click a card to open that form in the dictionary.`}
          />
          {/* Each group is a header plus its five cards. Column flow over six
              fixed rows puts one group per column on wide screens, which pairs
              each direct form with its indirect counterpart on a shared row,
              and falls back to one group after the other on narrow screens. */}
          <div className="grid gap-x-5 gap-y-3 md:grid-cols-2 md:grid-flow-col"
               style={{ gridTemplateRows: 'repeat(6, auto)' }}>
            {A_GROUPS.map((g) => (
              <React.Fragment key={g.title}>
                <div className="text-center px-2 pb-1 self-end">
                  <div className="text-xs text-slate-800">
                    <span className="font-semibold">{g.title} </span>
                    <span className="text-slate-500">{g.range}:</span>
                  </div>
                  <div className="text-[11px] italic text-slate-500 leading-snug">{g.sub}</div>
                </div>
                {g.codes.map((code) => {
                  const t = answerTypeByCode[code];
                  return t ? (
                    <AnswerFormCard key={code} t={t} total={s.repliedTyped} qTypeNames={qTypeNames}
                                    onOpen={() => openType(code, 'answer')} />
                  ) : null;
                })}
              </React.Fragment>
            ))}
          </div>
          <Card><AnswerFormLegend qTypeNames={qTypeNames} /></Card>
        </div>

        {/* Top patterns */}
        <div ref={patRef} className="scroll-mt-20 space-y-4">
          <SectionHeader
            eyebrow="The dictionary's head"
            title="The most common questions and answers"
            subtitle="The consolidated patterns with the most member comments, across the whole dataset."
          />
          <div className="grid md:grid-cols-2 gap-4">
            <Card title="Top question patterns" subtitle="Most frequent consolidated questions across the analyzed comments">
              <div className="space-y-3">
                {topQ.map((p, i) => (
                  <PatternBar key={p.id} rank={i + 1} type={p.type} color={qColor(p.type)} text={p.text} count={p.count} max={maxQ}
                              sub={`never replied ${formatNumber(p.neverReplied)}${p.answerRate !== null ? ` · answered when replied ${p.answerRate}%` : ''}`} />
                ))}
                {!topQ.length && <p className="text-xs text-slate-500">No consolidated patterns yet.</p>}
              </div>
            </Card>
            <Card title="Top answer patterns" subtitle="Most frequent consolidated answers found in the replies">
              <div className="space-y-3">
                {topA.map((p, i) => (
                  <PatternBar key={p.id} rank={i + 1} type={p.type} color={aColor(p.type)} text={p.text} count={p.count} max={maxA} />
                ))}
                {!topA.length && <p className="text-xs text-slate-500">No consolidated patterns yet.</p>}
              </div>
            </Card>
          </div>

          {/* Answer-rate contrast */}
          {(contrast.mostAnswered || []).length > 0 && (
            <Card title="Which questions get answered, and which get ignored"
                  subtitle="Question families with at least 30 member questions (the two answer-rate columns additionally require at least 10 replied questions); answer rate measured among questions that received replies.">
              <div className="grid md:grid-cols-3 gap-6 text-xs">
                <div>
                  <h4 className="font-semibold text-emerald-700 mb-3 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />Usually answered
                  </h4>
                  <ul className="space-y-3">
                    {contrast.mostAnswered.map((p) => (
                      <li key={p.id} className="space-y-1">
                        <div className="flex items-baseline gap-2">
                          <CategoryBadge code={p.type} color={qColor(p.type)} />
                          <span className="text-[10px] text-slate-400 tabular-nums">{formatNumber(p.count)} questions</span>
                          <span className="tabular-nums font-semibold text-emerald-700 ml-auto">{p.answerRate}%</span>
                        </div>
                        <p className="leading-snug text-slate-700">{p.text}</p>
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-emerald-500 rounded-full" style={{ width: p.answerRate + '%' }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-amber-700 mb-3 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />Rarely answered even when replied
                  </h4>
                  <ul className="space-y-3">
                    {contrast.leastAnswered.map((p) => (
                      <li key={p.id} className="space-y-1">
                        <div className="flex items-baseline gap-2">
                          <CategoryBadge code={p.type} color={qColor(p.type)} />
                          <span className="text-[10px] text-slate-400 tabular-nums">{formatNumber(p.count)} questions</span>
                          <span className="tabular-nums font-semibold text-amber-700 ml-auto">{p.answerRate}%</span>
                        </div>
                        <p className="leading-snug text-slate-700">{p.text}</p>
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-amber-500 rounded-full" style={{ width: p.answerRate + '%' }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="font-semibold text-slate-700 mb-3 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />Most often ignored entirely
                  </h4>
                  <ul className="space-y-3">
                    {contrast.mostIgnored.map((p) => (
                      <li key={p.id} className="space-y-1">
                        <div className="flex items-baseline gap-2">
                          <CategoryBadge code={p.type} color={qColor(p.type)} />
                          <span className="text-[10px] text-slate-400 tabular-nums">{formatNumber(p.count)} questions</span>
                          <span className="tabular-nums font-semibold text-slate-600 ml-auto">{p.neverRepliedShare}% never replied</span>
                        </div>
                        <p className="leading-snug text-slate-700">{p.text}</p>
                        <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-slate-400 rounded-full" style={{ width: p.neverRepliedShare + '%' }} />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          )}
        </div>

        {/* Dictionary browser */}
        <div ref={dictRef} className="scroll-mt-20 space-y-4">
          <SectionHeader
            eyebrow="Browse the hierarchy"
            title="The question dictionary"
            subtitle="Taxonomy type, then family, then pattern. Expand a family to see its patterns; expand a pattern to see real example comments, each linked back to YouTube. On the answer side the families and patterns consolidate the replies that carried a solution, and the record list at the bottom of each form holds every one of its replies, so the counts there match the answer form cards above."
          />
          <Card>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <Chip active={kind === 'question'} onClick={() => { setKind('question'); setTypeCode(null); }}>Questions</Chip>
              <Chip active={kind === 'answer'} onClick={() => { setKind('answer'); setTypeCode(null); }}>Answers</Chip>
              <span className="mx-1 text-slate-300">|</span>
              <Chip active={typeCode === null} onClick={() => setTypeCode(null)}>All types</Chip>
              {types.map((t) => (
                <Chip key={t.code} active={typeCode === t.code} onClick={() => setTypeCode(t.code)}
                      count={formatNumber(kind === 'question' ? t.count : t.replies)}>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full inline-block flex-shrink-0" style={{ backgroundColor: badgeColor(t.code) }} />
                    {t.code}
                  </span>
                </Chip>
              ))}
            </div>
            <input
              value={dictSearch}
              onChange={(e) => setDictSearch(e.target.value)}
              placeholder="Search patterns and families…"
              className="w-full mb-4 px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
            />
            {searchHits ? (
              <div className="space-y-1.5">
                <p className="text-[11px] text-slate-500 mb-2">{formatNumber(searchHits.length)} matching patterns</p>
                {searchHits.slice(0, 50).map((p) => (
                  <div key={p.id} className="text-xs px-3 py-2 border border-slate-100 rounded-md flex items-baseline gap-2">
                    <CategoryBadge code={p.typeCode} color={badgeColor(p.typeCode)} />
                    <span className="flex-1">{p.text}</span>
                    <span className="text-slate-400 flex-shrink-0 hidden sm:inline">{p.family}</span>
                    <span className="text-slate-500 tabular-nums flex-shrink-0">{formatNumber(p.count)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-5">
                {activeTypes.map((t) => (
                  <div key={t.code}>
                    <div className="flex items-center gap-2 mb-2">
                      <CategoryBadge code={t.code} color={badgeColor(t.code)} />
                      <h4 className="text-xs font-semibold text-slate-700">{t.name || qTypeNames[t.code]}</h4>
                      <span className="text-[11px] text-slate-400 tabular-nums">
                        {kind === 'question'
                          ? `${formatNumber(t.count)} questions · ${formatNumber(t.patternCount)} patterns`
                          : `${formatNumber(t.replies)} replies · ${formatNumber(t.solved)} carried a solution, consolidated into ${formatNumber(t.patternCount)} patterns`}
                      </span>
                    </div>
                    <div className="space-y-2">
                      {t.families.map((f) => (
                        <FamilyBlock key={f.id || f.label} family={f} isQuestion={kind === 'question'}
                                     accentColor={badgeColor(t.code)} />
                      ))}
                      {kind === 'answer' && recordsByForm && (recordsByForm[t.code] || []).length > 0 && (
                        <FormRecords code={t.code} rows={recordsByForm[t.code]} />
                      )}
                    </div>
                  </div>
                ))}
                {!activeTypes.length && <p className="text-xs text-slate-500">No consolidated patterns for this selection yet.</p>}
              </div>
            )}
          </Card>
        </div>

        {/* Extracted records browser */}
        <div ref={recRef} className="scroll-mt-20 space-y-4">
          <SectionHeader
            eyebrow="Row-level data"
            title="Every substantive question"
            subtitle="Each question the extraction pass found, with its canonical restatement, its reply outcome, and the best answering reply where one exists. Shows the 12,933 substantive questions used in the gap analysis; the 2,047 social or rhetorical (Q11) records remain in the downloadable database."
          />
          <Card>
            {!records ? (
              <p className="text-xs text-slate-500">Loading records…</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip active={status === 'all'} onClick={() => { setStatus('all'); setPage(0); }}
                        count={statusCounts ? formatNumber(statusCounts.all) : undefined}>All</Chip>
                  <Chip active={status === 'answered'} onClick={() => { setStatus('answered'); setPage(0); }}
                        count={statusCounts ? formatNumber(statusCounts.answered) : undefined}>Answered</Chip>
                  <Chip active={status === 'unanswered'} onClick={() => { setStatus('unanswered'); setPage(0); }}
                        count={statusCounts ? formatNumber(statusCounts.repliedUn) : undefined}>Replied, unanswered</Chip>
                  <Chip active={status === 'ignored'} onClick={() => { setStatus('ignored'); setPage(0); }}
                        count={statusCounts ? formatNumber(statusCounts.never) : undefined}>Never replied</Chip>
                  <select
                    value={recType}
                    onChange={(e) => { setRecType(e.target.value); setPage(0); }}
                    className="ml-auto text-xs border border-slate-200 rounded-md px-2 py-1.5 text-slate-700"
                  >
                    <option value="all">All question types</option>
                    {qa.questionTypes.map((t) => (
                      <option key={t.code} value={t.code}>{t.code} · {t.name || qTypeNames[t.code]}</option>
                    ))}
                  </select>
                </div>
                <input
                  value={recSearch}
                  onChange={(e) => { setRecSearch(e.target.value); setPage(0); }}
                  placeholder="Search question text…"
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-md focus:outline-none focus:border-slate-400"
                />
                <p className="text-[11px] text-slate-500">{formatNumber(filteredRecords.length)} questions match</p>
                <div className="divide-y divide-slate-100">
                  {pageRows.map((r) => (
                    <div key={r.commentId} className="py-3 space-y-1.5">
                      <div className="flex items-start gap-2">
                        <p className="text-xs text-slate-800 leading-snug flex-1">{r.questionExcerpt}</p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <CategoryBadge code={r.primaryType} color={qColor(r.primaryType)} />
                          <OutcomeBadge answered={r.answered} replyCount={r.replyCount} />
                        </div>
                      </div>
                      {r.canonical && <p className="text-[11px] text-slate-500 leading-snug italic">{r.canonical}</p>}
                      {r.answerExcerpt && (
                        <p className="text-[11px] text-emerald-800 leading-snug"><span className="font-medium">Answer: </span>{r.answerExcerpt}</p>
                      )}
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                        <span>{r.replyCount} {Number(r.replyCount) === 1 ? 'reply' : 'replies'}</span>
                        {r.answerTypes && <AnswerTypeChips codes={r.answerTypes} />}
                        {r.patternId && <span>{r.patternId}</span>}
                        <a className="text-slate-500 hover:text-slate-900 underline" target="_blank" rel="noopener"
                           href={youtubeLink(r.videoId, r.commentId)}>View on YouTube</a>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
                  <button disabled={page === 0} onClick={() => setPage(page - 1)}
                          className="px-3 py-1.5 border border-slate-200 rounded-md disabled:opacity-40 hover:bg-slate-50">Previous</button>
                  <span className="tabular-nums">Page {page + 1} of {formatNumber(pageCount)}</span>
                  <button disabled={page + 1 >= pageCount} onClick={() => setPage(page + 1)}
                          className="px-3 py-1.5 border border-slate-200 rounded-md disabled:opacity-40 hover:bg-slate-50">Next</button>
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* Downloads */}
        <div ref={dlRef} className="scroll-mt-20">
          <Card title="Download the data" subtitle="The underlying JSON files, for anyone who wants to look at the raw material">
            <div className="grid md:grid-cols-3 gap-3">
              {(qa.downloads || []).map((d) => (
                <a key={d.name} href={d.path} download
                   className="border border-slate-200 rounded-lg p-4 hover:border-slate-400 hover:bg-slate-50 transition-colors block">
                  <div className="text-sm font-medium text-slate-900 break-all">{d.name}</div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-relaxed">{d.description}</div>
                  <div className="text-[11px] text-slate-400 mt-2">{d.mb} MB · JSON</div>
                </a>
              ))}
            </div>
          </Card>
        </div>

      </div>
    );
  }

  return { QATab };
})();

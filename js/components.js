/* Reusable presentational primitives shared across tabs. */

window.AppComponents = window.AppComponents || {};

(function() {
  const { useState, useEffect, useRef } = React;
  const { pickContrastingTextColor } = window.AppUtils;

  // Generic interactive chip used by filter UIs and any place a small
  // toggle-style pill is needed. Honors active/inactive styling.
  const Chip = ({ active, onClick, children, count }) => (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all border ${
        active
          ? 'bg-slate-900 text-white border-slate-900'
          : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400 hover:bg-slate-50'
      }`}
    >
      {children}
      {count !== undefined && (
        <span className={`ml-1.5 ${active ? 'text-slate-300' : 'text-slate-400'}`}>
          {count}
        </span>
      )}
    </button>
  );

  // Minimal bordered surface used to wrap arbitrary sections.
  // `title` and `subtitle` are optional; pass children for the body.
  const Card = ({ title, subtitle, children, className = '' }) => (
    <div className={`bg-white border border-slate-200 rounded-lg p-6 ${className}`}>
      {(title || subtitle) && (
        <div className="mb-4">
          {title && <h3 className="serif text-lg font-semibold text-slate-900 mb-0.5">{title}</h3>}
          {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
        </div>
      )}
      {children}
    </div>
  );

  // Large numeric stat block. `value` is rendered as already-formatted text.
  // `hint` is optional small supporting text under the label.
  // Headline statistic tile. When `value` is a number, it counts up from
  // zero the first time the card scrolls into view; `format` renders each
  // frame. At rest the card shows the final value, so a tile that has not
  // (or never) intersected still reads the real number instead of 0.
  // The card also lifts on hover. A non-numeric `value` renders as-is.
  const StatCard = ({ label, value, hint, format }) => {
    const fmt = format || ((n) => Math.round(n).toLocaleString('en-US'));
    const target = Number(value);
    const animatable = Number.isFinite(target);
    const cardRef = useRef(null);
    const numRef = useRef(null);

    // Animate 0 -> target once, triggered when the card enters the viewport.
    // The frame values are written straight to the number node instead of
    // through React state, so the count-up stays fluid even while the rest of
    // the page is busy rendering the heavy figures below it.
    useEffect(() => {
      if (!animatable) return;
      const card = cardRef.current;
      const num = numRef.current;
      if (!card || !num) return;
      let raf = 0;
      let start = null;
      const duration = 1100;
      const step = (t) => {
        if (start === null) start = t;
        const p = Math.min(1, (t - start) / duration);
        const eased = 1 - Math.pow(1 - p, 3);
        num.textContent = fmt(Math.round(target * eased));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          raf = requestAnimationFrame(step);
          observer.disconnect();
        }
      }, { threshold: 0.4 });
      observer.observe(card);
      return () => { observer.disconnect(); cancelAnimationFrame(raf); };
    }, [target, animatable]);

    return (
      <div
        ref={cardRef}
        className="bg-white border border-slate-200 rounded-lg p-5 transition duration-200 hover:-translate-y-0.5 hover:shadow-md hover:border-slate-300"
      >
        <div ref={numRef} className="serif text-3xl sm:text-4xl font-semibold text-slate-900 tabular-nums leading-none">
          {animatable ? fmt(0) : value}
        </div>
        <div className="text-[11px] uppercase tracking-wider text-slate-500 mt-2 font-medium">
          {label}
        </div>
        {hint && <div className="text-[11px] text-slate-400 mt-1">{hint}</div>}
      </div>
    );
  };

  // Category tile for the 10-class schema grid. Shows the short code as a
  // colored swatch on the left and the full name + description on the right.
  // The swatch text color is auto-picked for contrast against the bg color.
  const SchemaChip = ({ code, name, description, color, onClick, active }) => {
    const textColor = pickContrastingTextColor(color);
    return (
      <div
        onClick={onClick}
        className={`bg-white border rounded-lg p-4 flex items-start gap-3 transition duration-200 ${onClick ? 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md' : ''} ${active ? '' : 'border-slate-200'}`}
        style={active ? { borderColor: color, boxShadow: `0 0 0 1px ${color}` } : undefined}
      >
        <span
          className="flex-shrink-0 inline-flex items-center justify-center min-w-[3rem] h-9 px-2 rounded-md text-xs font-semibold tracking-wide"
          style={{ backgroundColor: color, color: textColor }}
          title={`${code}, ${name}`}
        >
          {code}
        </span>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 leading-snug">{name}</div>
          <div className="text-xs text-slate-600 mt-1 leading-relaxed">{description}</div>
        </div>
      </div>
    );
  };

  // Full-bleed figure card used by the Findings tab. Header shows the
  // figure number and title; body slot holds the asset (iframe, img, etc.);
  // caption is the paper-style prose; dataSource is a small footnote.
  const FigureCard = ({ number, title, caption, dataSource, children, minHeight = 360 }) => {
    // Defer the heavy figure body (Plotly, 3D graph, iframe, injected SVG)
    // until the card scrolls near the viewport. This keeps the initial page
    // mount light so the "By the numbers" count-up stays fluid, and spreads
    // the figure-rendering cost out as the reader scrolls down. The header and
    // the figure's anchor id always render, so in-page "See Figure N" links
    // still resolve. A reserved-height placeholder holds layout until reveal.
    const bodyRef = useRef(null);
    const [revealed, setRevealed] = useState(false);
    useEffect(() => {
      if (revealed) return;
      const node = bodyRef.current;
      if (!node) return;
      const observer = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
          setRevealed(true);
          observer.disconnect();
        }
      }, { rootMargin: '300px 0px' });
      observer.observe(node);
      return () => observer.disconnect();
    }, [revealed]);

    return (
      <figure id={`fig-${number}`} className="bg-white border border-slate-200 rounded-lg overflow-hidden scroll-mt-20">
        <header className="px-6 pt-5 pb-4 border-b border-slate-100 space-y-2">
          <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
            Figure {number}
          </div>
          <h3 className="serif text-lg font-semibold text-slate-900 leading-snug">{title}</h3>
          {caption && (
            <p className="text-sm text-slate-700 leading-relaxed serif">{caption}</p>
          )}
        </header>
        <div ref={bodyRef} className="bg-stone-50">
          {revealed ? children : (
            <div style={{ minHeight }} className="flex items-center justify-center text-[11px] text-slate-400">
              Loading figure…
            </div>
          )}
        </div>
        {dataSource && (
          <figcaption className="px-6 py-3 border-t border-slate-100">
            <p className="text-[11px] text-slate-500">
              <span className="uppercase tracking-wider font-semibold">Data source: </span>
              <span>{dataSource}</span>
            </p>
          </figcaption>
        )}
      </figure>
    );
  };

  // Small colored pill that displays a category code (and optionally its
  // full name). Background is the canonical category color from
  // categories.json; text color is auto-picked for contrast.
  const CategoryBadge = ({ code, name, color, size = 'sm' }) => {
    const textColor = pickContrastingTextColor(color);
    const sizeClasses = size === 'lg'
      ? 'text-sm px-3 py-1.5'
      : 'text-[11px] px-2 py-0.5';
    return (
      <span
        className={`inline-flex items-center gap-1.5 rounded-md font-semibold tracking-wide ${sizeClasses}`}
        style={{ backgroundColor: color, color: textColor }}
        title={name ? `${code}, ${name}` : code}
      >
        <span>{code}</span>
        {name && <span className="font-normal opacity-90 hidden sm:inline">· {name}</span>}
      </span>
    );
  };

  // Horizontal "weight bar" used in the comment modal's themes block.
  // Renders the theme name above a percentage-filled bar so multi-theme
  // assignments are visually comparable at a glance.
  const ThemeBar = ({ name, weight, color = '#0f172a' }) => {
    const pct = Math.max(0, Math.min(100, Number(weight) || 0));
    return (
      <div className="space-y-1">
        <div className="flex items-baseline justify-between gap-3 text-xs">
          <span className="text-slate-800 font-medium truncate">{name}</span>
          <span className="text-slate-500 tabular-nums flex-shrink-0">{pct}%</span>
        </div>
        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
        </div>
      </div>
    );
  };

  // Modal that renders a single wiki page's raw markdown body inside a
  // scrollable monospace block. Used by the chat tab's "Further reading"
  // footer so the user can inspect the underlying knowledge-base page.
  const WikiPageModal = ({ page, onClose }) => {
    React.useEffect(() => {
      const handler = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handler);
        document.body.style.overflow = '';
      };
    }, [onClose]);

    if (!page) return null;

    return (
      <div
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-modal flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto"
        onClick={onClose}
      >
        <div
          className="bg-white w-full max-w-3xl rounded-none sm:rounded-xl shadow-xl my-0 sm:my-6 animate-fade max-h-[95vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-4 flex justify-between items-start gap-4 rounded-t-xl">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-slate-500 mb-1">
                <span className="uppercase tracking-wider">{page.type || 'page'}</span>
                {page.sourceCount !== undefined && (
                  <>
                    <span>·</span>
                    <span>{page.sourceCount} source records</span>
                  </>
                )}
                {page.lastUpdated && (
                  <>
                    <span>·</span>
                    <span>updated {String(page.lastUpdated).slice(0, 10)}</span>
                  </>
                )}
              </div>
              <h2 className="serif text-lg font-semibold text-slate-900 leading-tight">{page.title}</h2>
              <p className="text-[11px] text-slate-500 mt-0.5 break-all">{page.slug}.md</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-900 text-xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 flex-shrink-0"
              aria-label="Close"
            >×</button>
          </div>
          <div className="overflow-y-auto px-6 py-5 scrollbar-thin">
            <pre className="whitespace-pre-wrap text-[12.5px] text-slate-800 leading-relaxed font-mono">{page.body || '(no body)'}</pre>
          </div>
        </div>
      </div>
    );
  };

  window.AppComponents.Chip = Chip;
  window.AppComponents.Card = Card;
  window.AppComponents.StatCard = StatCard;
  window.AppComponents.SchemaChip = SchemaChip;
  window.AppComponents.FigureCard = FigureCard;
  window.AppComponents.CategoryBadge = CategoryBadge;
  window.AppComponents.ThemeBar = ThemeBar;
  window.AppComponents.WikiPageModal = WikiPageModal;
})();

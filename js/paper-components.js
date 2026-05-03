/* =========================================================
   Reusable presentational components: PaperCard, PaperModal,
   Chip, StatCard, ChartCard, FilterGroup, DetailMeta.
   ========================================================= */

window.AppComponents = window.AppComponents || {};

(function() {
  const { useEffect } = React;
  const { splitMulti } = window.AppUtils;

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

  const PaperCard = ({ paper, onClick }) => {
    const aiModels = splitMulti(paper['AI Model Used']).slice(0, 3);
    const citation = paper.Author_Year && paper.Author_Year.trim()
      ? paper.Author_Year.trim()
      : (() => {
          const authors = (paper.Authors || '').split(';').map(a => a.trim()).filter(Boolean);
          if (authors.length === 0) return paper.Year || '';
          const lastName = authors[0].split(',')[0].trim();
          const suffix = authors.length === 1 ? '' : authors.length === 2
            ? ` and ${authors[1].split(',')[0].trim()}`
            : ' et al.';
          return `${lastName}${suffix} (${paper.Year})`;
        })();

    return (
      <article
        onClick={onClick}
        className="bg-white border border-slate-200 rounded-lg p-5 hover:border-slate-400 hover:shadow-sm transition-all cursor-pointer group animate-fade"
      >
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="text-xs text-slate-500 truncate">
            <span className="italic">{paper.Journal}</span>
          </div>
          {paper.DOI && (
            <a
              href={paper.DOI.startsWith('http') ? paper.DOI : `https://doi.org/${paper.DOI}`}
              target="_blank"
              rel="noopener"
              onClick={(e) => e.stopPropagation()}
              className="text-xs text-slate-400 hover:text-slate-700 flex-shrink-0"
              title="Open DOI"
            >
              ↗ DOI
            </a>
          )}
        </div>
        <h3 className="serif text-base font-semibold text-slate-900 leading-snug mb-2 group-hover:text-slate-700 transition-colors">
          {paper.Title}
        </h3>
        <p className="text-xs text-slate-600 mb-3 font-medium">{citation}</p>
        <div className="flex flex-wrap gap-1.5">
          {paper['Construction Topic'] && (
            <span className="text-[10px] uppercase tracking-wide font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              {paper['Construction Topic'].length > 40 ? paper['Construction Topic'].slice(0, 40) + '…' : paper['Construction Topic']}
            </span>
          )}
          {aiModels.map(m => (
            <span key={m} className="text-[10px] uppercase tracking-wide font-medium text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
              {m.length > 30 ? m.slice(0, 30) + '…' : m}
            </span>
          ))}
          {paper['Research Method'] && (
            <span className="text-[10px] uppercase tracking-wide font-medium text-slate-500 bg-stone-100 px-2 py-0.5 rounded">
              {paper['Research Method']}
            </span>
          )}
        </div>
      </article>
    );
  };

  const DetailMeta = ({ label, value, isLink }) => {
    if (!value) return null;
    return (
      <div>
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 mb-0.5">
          {label}
        </div>
        <div className="text-xs text-slate-700 break-words">
          {isLink ? (
            <a
              href={value.startsWith('http') ? value : `https://doi.org/${value}`}
              target="_blank"
              rel="noopener"
              className="text-slate-700 hover:text-slate-900 underline underline-offset-2"
            >
              {value.replace('https://doi.org/', '')}
            </a>
          ) : value}
        </div>
      </div>
    );
  };

  const PaperModal = ({ paper, onClose }) => {
    useEffect(() => {
      const handler = (e) => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handler);
        document.body.style.overflow = '';
      };
    }, [onClose]);

    const fields = [
      { label: 'Abstract', key: 'Abstract' },
      { label: 'Research Goal', key: 'Research Goal' },
      { label: 'Methodology', key: 'Methodology' },
      { label: 'Results', key: 'Results' },
      { label: 'Gaps Addressed', key: 'Gaps Addressed' },
      { label: 'Future Research', key: 'Future Research' },
    ];

    return (
      <div
        className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-modal flex items-start sm:items-center justify-center p-0 sm:p-6 overflow-y-auto"
        onClick={onClose}
      >
        <div
          className="bg-white w-full max-w-3xl rounded-none sm:rounded-xl shadow-xl my-0 sm:my-6 animate-fade"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-200 px-6 py-4 flex justify-between items-start gap-4 rounded-t-xl">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs text-slate-500 mb-1">
                <span className="font-medium">{paper.Year}</span>
                <span>·</span>
                <span className="truncate">{paper.Journal}</span>
                <span>·</span>
                <span>{paper['Research Location']}</span>
              </div>
              <h2 className="serif text-lg font-semibold text-slate-900 leading-tight">
                {paper.Title}
              </h2>
              <p className="text-sm text-slate-600 mt-1">{paper.Authors}</p>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-900 text-xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-slate-100 flex-shrink-0"
              aria-label="Close"
            >×</button>
          </div>

          <div className="px-6 py-5 space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pb-4 border-b border-slate-100">
              <DetailMeta label="Application Area" value={paper['Construction Application Area']} />
              <DetailMeta label="Construction Topic" value={paper['Construction Topic']} />
              <DetailMeta label="Research Method" value={paper['Research Method']} />
              <DetailMeta label="AI Model" value={paper['AI Model Used']} />
              <DetailMeta label="Data Types" value={paper['Data Types']} />
              <DetailMeta label="DOI" value={paper.DOI} isLink />
            </div>

            {fields.map(f => paper[f.key] ? (
              <section key={f.key}>
                <h3 className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">
                  {f.label}
                </h3>
                <p className="text-sm text-slate-700 leading-relaxed serif">
                  {paper[f.key]}
                </p>
              </section>
            ) : null)}
          </div>
        </div>
      </div>
    );
  };

  const StatCard = ({ label, value }) => (
    <div className="bg-white border border-slate-200 rounded-lg p-5">
      <div className="serif text-4xl font-semibold text-slate-900 tabular-nums leading-none">{value}</div>
      <div className="text-xs uppercase tracking-wider text-slate-500 mt-2 font-medium">{label}</div>
    </div>
  );

  const ChartCard = ({ title, subtitle, children }) => (
    <div className="bg-white border border-slate-200 rounded-lg p-6">
      <div className="mb-4">
        <h3 className="serif text-lg font-semibold text-slate-900 mb-0.5">{title}</h3>
        <p className="text-sm text-slate-500">{subtitle}</p>
      </div>
      {children}
    </div>
  );

  const FilterGroup = ({ label, values, active, onToggle, truncate }) => (
    <div>
      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {values.map(v => (
          <Chip key={v} active={active.has(v)} onClick={() => onToggle(v)}>
            {truncate && v.length > truncate ? v.slice(0, truncate) + '…' : v}
          </Chip>
        ))}
      </div>
    </div>
  );

  window.AppComponents.Chip = Chip;
  window.AppComponents.PaperCard = PaperCard;
  window.AppComponents.PaperModal = PaperModal;
  window.AppComponents.StatCard = StatCard;
  window.AppComponents.ChartCard = ChartCard;
  window.AppComponents.FilterGroup = FilterGroup;
})();
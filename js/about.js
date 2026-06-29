/* About tab. Static prose: project description, authors, citation,
   code/data links, acknowledgments, contact. Several fields are currently
   redacted while the paper is under peer review. */

window.AppAbout = (function() {

  const REDACTED = '[CURRENTLY HIDDEN FOR PEER REVIEW]';

  function AboutTab() {
    return (
      <div className="animate-fade py-8 max-w-3xl">

        <section className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">About</p>
          <h2 className="serif text-3xl sm:text-4xl font-semibold text-slate-900 leading-tight">
            About this project
          </h2>
        </section>

        {/* Project description. */}
        <section className="mb-10">
          <h3 className="serif text-xl font-semibold text-slate-900 mb-3">What we built</h3>
          <div className="text-slate-700 leading-relaxed text-base space-y-4">
            <p>
              ElectriAI is a research project that mines YouTube to map the practical
              questions electrical contractors and apprentices ask every day. Transcripts and
              viewer Q&amp;A comments are classified into a 10-class schema covering the major
              areas of the electrical trade. GPT does a first pass; trained human annotators
              validate a balanced subset through Qualtrics surveys, which lets us measure
              where the model agrees with practitioners and where it doesn&apos;t.
            </p>
            <p>
              The companion chatbot (the Ask ElectriAI tab) is grounded in a hand-curated
              markdown knowledge-base distilled from the underlying dataset. It is not a
              generic LLM wrapped around the web, every answer cites the wiki page,
              source video, or viewer comment it draws from.
            </p>
          </div>
        </section>

        <section className="mb-10">
          <h3 className="serif text-xl font-semibold text-slate-900 mb-3">Authors</h3>
          <p className="text-slate-700 leading-relaxed">{REDACTED}</p>
        </section>

        <section className="mb-10">
          <h3 className="serif text-xl font-semibold text-slate-900 mb-3">How to cite</h3>
          <p className="text-slate-700 leading-relaxed mb-3">
            A preprint is in preparation. Citation details will appear here once available.
          </p>
          <pre className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-[12px] font-mono text-slate-800 whitespace-pre-wrap leading-relaxed">
            {`@unpublished{electriai2026,\n  title  = {${REDACTED}},\n  author = {${REDACTED}},\n  year   = {2026},\n  note   = {Manuscript in preparation}\n}`}
          </pre>
        </section>

        <section className="mb-10">
          <h3 className="serif text-xl font-semibold text-slate-900 mb-3">Code &amp; data</h3>
          <ul className="space-y-2 text-slate-700">
            <li>Source code: {REDACTED}</li>
            <li>License: {REDACTED}</li>
          </ul>
        </section>

        <section className="mb-10">
          <h3 className="serif text-xl font-semibold text-slate-900 mb-3">Acknowledgments</h3>
          <p className="text-slate-700 leading-relaxed">{REDACTED}</p>
        </section>

        <section className="mb-2">
          <h3 className="serif text-xl font-semibold text-slate-900 mb-3">Contact</h3>
          <p className="text-slate-700 leading-relaxed">{REDACTED}</p>
        </section>

      </div>
    );
  }

  return { AboutTab };
})();

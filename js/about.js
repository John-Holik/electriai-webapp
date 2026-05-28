/* About tab. Static prose: project description, authors, citation,
   code/data links, acknowledgments, contact. Several fields below are
   placeholders — search for "TODO" to find them. */

window.AppAbout = (function() {

  function AboutTab() {
    return (
      <div className="animate-fade py-8 max-w-3xl">

        <section className="mb-8">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">About</p>
          <h2 className="serif text-3xl sm:text-4xl font-semibold text-slate-900 leading-tight">
            About this project
          </h2>
        </section>

        {/* Project description. Mirrors the elevator pitch on the Research
            Results tab but stripped of stat-card numbers so the prose stays
            evergreen as the dataset grows. */}
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
              markdown knowledge-base distilled from the underlying corpus. It is not a
              generic LLM wrapped around the web — every answer cites the wiki page,
              source video, or viewer comment it draws from.
            </p>
          </div>
        </section>

        {/* Authors block. Replace the placeholders with the real list of
            authors, ordered as they will appear on the paper. */}
        <section className="mb-10">
          <h3 className="serif text-xl font-semibold text-slate-900 mb-3">Authors</h3>
          <ul className="space-y-2 text-slate-700">
            {/* TODO: replace these two rows with the real author roster. */}
            <li>
              <span className="font-medium text-slate-900">Author One</span>
              <span className="text-slate-500"> — Role, Affiliation</span>
            </li>
            <li>
              <span className="font-medium text-slate-900">Author Two</span>
              <span className="text-slate-500"> — Role, Affiliation</span>
            </li>
          </ul>
        </section>

        {/* Citation block. The bibtex / formatted reference goes here once
            the preprint or paper has a stable identifier. */}
        <section className="mb-10">
          <h3 className="serif text-xl font-semibold text-slate-900 mb-3">How to cite</h3>
          <p className="text-slate-700 leading-relaxed mb-3">
            {/* TODO: replace with the real citation once the preprint posts. */}
            A preprint is in preparation. Citation details will appear here once available.
          </p>
          <pre className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-[12px] font-mono text-slate-800 whitespace-pre-wrap leading-relaxed">
            {'@unpublished{electriai2026,\n  title  = {ElectriAI: TODO paper title},\n  author = {TODO authors},\n  year   = {2026},\n  note   = {Manuscript in preparation}\n}'}
          </pre>
        </section>

        {/* Code and data block. The GitHub URL and license text below are
            placeholders; replace once the repo is public. */}
        <section className="mb-10">
          <h3 className="serif text-xl font-semibold text-slate-900 mb-3">Code &amp; data</h3>
          <ul className="space-y-2 text-slate-700">
            <li>
              Source code:{' '}
              {/* TODO: replace href with the public repo URL. */}
              <a href="#" className="text-slate-900 underline hover:text-slate-600">
                github.com/TODO/electriai-research
              </a>
            </li>
            <li>
              {/* TODO: replace with the chosen license (CC-BY, MIT, ODbL, etc.). */}
              Dataset and figures are released under TODO license.
            </li>
          </ul>
        </section>

        {/* Acknowledgments block. Funding sources, advisors, contributors,
            and any APIs whose terms require attribution. */}
        <section className="mb-10">
          <h3 className="serif text-xl font-semibold text-slate-900 mb-3">Acknowledgments</h3>
          <p className="text-slate-700 leading-relaxed">
            {/* TODO: name the funder, host institution, student annotators,
                and any third-party APIs / models that need attribution. */}
            We thank TODO for support, TODO student annotators for their work on the
            Qualtrics surveys, and the YouTube creators whose public videos form the
            basis of this corpus.
          </p>
        </section>

        {/* Contact block. */}
        <section className="mb-2">
          <h3 className="serif text-xl font-semibold text-slate-900 mb-3">Contact</h3>
          <p className="text-slate-700 leading-relaxed">
            {/* TODO: replace with the preferred public-facing contact address. */}
            Questions, corrections, or collaboration ideas:{' '}
            <a href="mailto:TODO@example.edu" className="text-slate-900 underline hover:text-slate-600">
              TODO@example.edu
            </a>
          </p>
        </section>

      </div>
    );
  }

  return { AboutTab };
})();

/* About tab. Static prose: project description, authors, citation,
   code/data links, acknowledgments, contact. Several fields are currently
   redacted while the manuscript is in preparation. */

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
              This project mines practitioner discussion on YouTube to map the practical questions electrical contractors and apprentices ask every day, and it does so in two stages. In the first stage, GPT-5-mini classified 16,862 viewer comment threads from 794 collected YouTube videos into question and answer structure and a ten-category subject schema covering the major areas of the electrical trade; trained human annotators then validated a balanced subset through Qualtrics surveys, which measures where the model agrees with practitioners and where it does not.
            </p>
            <p>
              In the second stage, GPT-5.6 Luna (medium reasoning effort) re-read all 14,980 detected questions and classified them into a literature-grounded taxonomy of ten substantive question types (a residual class, Q11 social or rhetorical, is excluded from the gap analysis) and ten answer mechanisms (A1 to A10), plus a small untyped bucket for replied rows with no classified mechanism. A consolidation pass then grouped the questions into 263 recurring question families and the answers into 204 answer families. The headline finding is that 60.2 percent of substantive questions never receive a reply, while 71.2 percent of replied questions get a substantive answer, so knowledge bottlenecks are read off per question type and family. These taxonomy results are a single-model pilot (GPT-5.6 Luna, taxonomy v0, consolidation v1) and are provisional pending human validation; the first-stage subject classification was human-validated through the Qualtrics surveys (Table 1 on the Findings tab).
            </p>
            <p>
              The companion assistant, available under the Ask the Knowledge Base tab, is grounded in a 288-page knowledge base compiled automatically from the question taxonomy and served through retrieval-augmented generation (Gemini embeddings with in-browser cosine retrieval). It is not a general-purpose language model wrapped around the open web; every answer cites the knowledge-base page, source video, or viewer comment from which it is drawn.
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

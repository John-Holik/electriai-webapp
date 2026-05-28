/* Research Results tab. Single landing tab that merges the old Overview
   (project intro, headline stats, 10-class schema) with the old Findings
   (four paper figures). The bottom "Where to next" CTA grid was dropped
   when the tab count shrank to four. */

window.AppResearch = (function() {
  const { useState, useEffect, useRef, useMemo } = React;
  const { StatCard, SchemaChip, FigureCard } = window.AppComponents;
  const { formatNumber, formatCompact } = window.AppUtils;

  // Inline Plotly bubble chart. Clicking a category bubble reveals a sample
  // panel below; clicks on the bubble-size reference circles are ignored.
  function BottleneckChart({ bottleneck, comments }) {
    const divRef = useRef(null);
    const [selected, setSelected] = useState(null);

    useEffect(() => {
      const cats = bottleneck.categories;
      const { meanResolution, medianQuestions } = bottleneck.referenceLines;
      const { xMax, yCap } = bottleneck.axes;
      const { refValues, refSizes } = bottleneck.bubbleLegend;
      const manualBelow = new Set(bottleneck.manualBelow || []);
      const fontSize = 12;
      const fontFamily = 'Calibri';

      // Main data trace. customdata carries the category string used on click.
      const traces = [{
        x: cats.map(c => c.totalQuestions),
        y: cats.map(c => c.resolutionRate * 100),
        mode: 'markers',
        type: 'scatter',
        marker: {
          size: cats.map(c => c.bubbleSize),
          color: cats.map(c => c.avgViews),
          colorscale: [
            [0, '#f7fbff'],
            [0.5, '#9ecae1'],
            [1, '#4292c6'],
          ],
          colorbar: {
            title: { text: 'Average<br>View Count', font: { size: fontSize } },
            tickfont: { size: fontSize },
            thickness: 12,
            len: 0.55,
          },
          opacity: 0.82,
          line: { width: 1, color: 'black' },
        },
        customdata: cats.map(c => c.category),
        hovertemplate: cats.map(c =>
          `<b>${c.category}</b><br>` +
          `Total Questions: ${c.totalQuestions}<br>` +
          `Resolution Rate: ${(c.resolutionRate * 100).toFixed(1)}%<br>` +
          `Total Comments: ${c.totalComments.toLocaleString()}<br>` +
          `Average Views: ${Math.round(c.avgViews).toLocaleString()}<extra></extra>`
        ),
        showlegend: false,
      }];

      // Bubble-size legend reference circles. Spaced by pixel-aware gaps so
      // adjacent circles don't overlap when the chart is 640px tall.
      const xBubble = xMax * 0.88;
      const xLabel = xMax * 0.965;
      const yTop = 43.0;
      const legendGapPx = 10;
      const yPixelsPerUnit = (640 - 20 - 64) / yCap;
      const legendYPositions = [yTop];
      for (let i = 1; i < refSizes.length; i++) {
        const gap = (refSizes[i - 1] / 2 + refSizes[i] / 2 + legendGapPx) / yPixelsPerUnit;
        legendYPositions.push(legendYPositions[i - 1] - gap);
      }
      refValues.forEach((value, i) => {
        traces.push({
          x: [xBubble],
          y: [legendYPositions[i]],
          mode: 'markers',
          type: 'scatter',
          marker: { size: refSizes[i], color: 'rgb(170,170,170)', line: { width: 1, color: 'black' } },
          hoverinfo: 'skip',
          showlegend: false,
        });
      });

      // Annotations: category short labels, reference-line callouts, quadrant
      // boxes, and the legend title plus its three count labels.
      const annotations = [];
      cats.forEach((c, i) => {
        const placeAbove = !manualBelow.has(c.shortLabel) && i % 2 === 1;
        const yshift = Math.round((c.bubbleSize / 2 + 12) * (placeAbove ? 1 : -1));
        annotations.push({
          x: c.totalQuestions,
          y: c.resolutionRate * 100,
          text: c.shortLabel,
          showarrow: false,
          yshift,
          font: { family: fontFamily, size: fontSize, color: '#000000' },
        });
      });
      annotations.push({
        x: xMax * 1.05,
        y: meanResolution,
        text: `Mean Resolution: ${meanResolution.toFixed(1)}%`,
        showarrow: false,
        yshift: 12,
        xanchor: 'right',
        font: { family: fontFamily, size: fontSize, color: '#000000' },
      });
      annotations.push({
        x: medianQuestions,
        y: yCap,
        text: `Median Questions: ${medianQuestions.toFixed(0)}`,
        showarrow: false,
        yshift: -12,
        xshift: 6,
        xanchor: 'left',
        font: { family: fontFamily, size: fontSize, color: '#000000' },
      });
      const quadrantBase = {
        showarrow: false,
        font: { family: fontFamily, size: fontSize, color: '#000000' },
        bgcolor: 'rgba(255,255,255,0.75)',
        bordercolor: '#BFBFBF',
        borderwidth: 1,
        borderpad: 4,
      };
      annotations.push({ ...quadrantBase, x: xMax * 0.73, y: 46, text: 'I. High Volume<br>High Resolution' });
      annotations.push({ ...quadrantBase, x: xMax * 0.16, y: 46, text: 'II. Low Volume<br>High Resolution' });
      annotations.push({ ...quadrantBase, x: xMax * 0.16, y: 8, text: 'III. Low Volume<br>Low Resolution' });
      annotations.push({ ...quadrantBase, x: xMax * 0.76, y: 8, text: 'IV. High Volume<br>Low Resolution' });

      const legendBoxX0 = xMax * 0.81;
      const legendBoxX1 = xMax * 1.03;
      const legendBoxY0 = legendYPositions[legendYPositions.length - 1] - 3.0;
      const legendBoxY1 = 48.5;
      annotations.push({
        x: (legendBoxX0 + legendBoxX1) / 2,
        y: 47.2,
        text: 'Total Comments',
        showarrow: false,
        font: { family: fontFamily, size: fontSize, color: '#000000' },
      });
      refValues.forEach((value, i) => {
        annotations.push({
          x: xLabel,
          y: legendYPositions[i],
          text: value.toLocaleString(),
          showarrow: false,
          xanchor: 'center',
          yanchor: 'middle',
          font: { family: fontFamily, size: fontSize, color: '#000000' },
        });
      });

      // Dashed mean/median reference lines and the legend background rectangle.
      const shapes = [
        {
          type: 'line', xref: 'paper', x0: 0, x1: 1,
          yref: 'y', y0: meanResolution, y1: meanResolution,
          line: { dash: 'dash', color: 'gray', width: 1 },
        },
        {
          type: 'line', yref: 'paper', y0: 0, y1: 1,
          xref: 'x', x0: medianQuestions, x1: medianQuestions,
          line: { dash: 'dash', color: 'gray', width: 1 },
        },
        {
          type: 'rect',
          x0: legendBoxX0, x1: legendBoxX1,
          y0: legendBoxY0, y1: legendBoxY1,
          fillcolor: 'white', opacity: 0.88,
          line: { color: '#BFBFBF', width: 1 },
          layer: 'below',
        },
      ];

      const layout = {
        autosize: true,
        height: 640,
        font: { family: fontFamily, size: fontSize, color: '#000000' },
        xaxis: {
          title: { text: 'Total Questions', font: { family: fontFamily, size: fontSize, color: '#000000' } },
          range: [0, xMax * 1.16],
          tickfont: { family: fontFamily, size: fontSize, color: '#000000' },
          showgrid: true, gridcolor: 'white', zeroline: false, showline: false,
        },
        yaxis: {
          title: { text: 'Resolution Rate (%)', font: { family: fontFamily, size: fontSize, color: '#000000' } },
          range: [0, yCap],
          tickvals: [0, 10, 20, 30, 40, 50],
          tickfont: { family: fontFamily, size: fontSize, color: '#000000' },
          showgrid: true, gridcolor: 'white', zeroline: false, showline: false,
        },
        margin: { t: 20, l: 64, r: 96, b: 64 },
        showlegend: false,
        hovermode: 'closest',
        paper_bgcolor: 'white',
        plot_bgcolor: '#E5ECF6',
        annotations,
        shapes,
      };

      const div = divRef.current;

      // curveNumber 0 is the data layer; legend reference circles are >0.
      const handler = (e) => {
        const pt = e.points && e.points[0];
        if (!pt || pt.curveNumber !== 0) return;
        setSelected(pt.customdata);
      };

      // Bind on the resolved graph div so Plotly's event emitter is ready.
      Plotly.newPlot(div, traces, layout, { responsive: true, displaylogo: false })
        .then((gd) => {
          gd.on('plotly_click', handler);
        });

      return () => { Plotly.purge(div); };
    }, [bottleneck]);

    const samples = useMemo(() => {
      if (!selected || !comments) return [];
      return comments.filter(c => c.category === selected).slice(0, 5);
    }, [selected, comments]);

    return (
      <>
        <div ref={divRef} style={{ width: '100%', height: '640px' }} />
        <noscript>
          <img
            src="figures/knowledge_bottleneck_bubble.svg"
            alt="Static fallback bubble chart showing demand and answer rate per electrical theme."
            style={{ width: '100%', display: 'block' }}
          />
        </noscript>
        {selected && (
          <div className="mt-4 bg-slate-100 rounded-lg p-4 border border-slate-200">
            <div className="flex items-baseline justify-between mb-3">
              <h4 className="serif text-base font-semibold text-slate-900">
                Sample comments from {selected}
              </h4>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >Clear</button>
            </div>
            {samples.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No curated samples for this category.</p>
            ) : (
              <ul className="space-y-3">
                {samples.map((c) => (
                  <li key={c.recordId} className="text-sm text-slate-700">
                    <p className="leading-relaxed">"{c.commentText}"</p>
                    <p className="text-xs text-slate-500 mt-1">
                      <a href={c.videoUrl} target="_blank" rel="noopener" className="underline">{c.videoTitle}</a>
                      {c.questionSummary ? ` · Q: ${c.questionSummary}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </>
    );
  }

  function ResearchTab({ state }) {
    const stats = state.stats || {};
    const categories = state.categories || [];

    // Stat card definitions. Each entry pulls a raw value from
    // summary_stats.json and formats it with the appropriate helper.
    const statCards = [
      { label: 'Videos analyzed',      value: formatNumber(stats.totalVideos),   hint: `${formatNumber(stats.videosWithQa)} with Q&A comments` },
      { label: 'Comments processed',   value: formatNumber(stats.totalComments) },
      { label: 'Unique themes',        value: formatNumber(stats.uniqueThemes) },
      { label: 'Knowledge-base pages', value: formatNumber(stats.kbPages),       hint: `${formatNumber(stats.kbThemePages)} themes + ${formatNumber(stats.kbConceptPages)} concepts` },
      { label: 'Total video views',    value: formatCompact(stats.totalViews) },
    ];

    return (
      <div className="space-y-12 animate-fade py-8">

        {/* Project intro: title, three-paragraph elevator pitch. */}
        <section className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">ElectriAI Research</p>
          <h2 className="serif text-3xl sm:text-5xl font-semibold text-slate-900 leading-[1.1] tracking-tight">
            What electrical contractors actually ask about online
          </h2>
          <div className="text-slate-700 mt-5 leading-relaxed text-base space-y-4">
            <p>
              ElectriAI is a research project that mines YouTube to map the practical
              questions electrical contractors and apprentices ask every day. We pulled
              transcripts from {formatNumber(stats.totalVideos)} videos across the trade,
              then extracted and labeled every viewer Q&amp;A comment thread to see where
              the real knowledge gaps live.
            </p>
            <p>
              Every comment is classified into a 10-category schema covering the major
              areas of the electrical trade. GPT does a first pass and trained human
              annotators validate a balanced subset through Qualtrics surveys, which lets
              us measure where the model agrees with practitioners and where it doesn&apos;t.
            </p>
            <p>
              This site collects the paper&apos;s figures, an explorer for the labeled
              comments, and a chatbot grounded in a hand-curated wiki of {formatNumber(stats.kbPages)}
              {' '}knowledge-base pages distilled from the underlying corpus.
            </p>
          </div>
        </section>

        {/* Headline statistics grid. */}
        <section>
          <h3 className="serif text-xl font-semibold text-slate-900 mb-4">By the numbers</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {statCards.map((s) => (
              <StatCard key={s.label} label={s.label} value={s.value} hint={s.hint} />
            ))}
          </div>
        </section>

        {/* 10-class schema cards. */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="serif text-xl font-semibold text-slate-900">The 10-class schema</h3>
            <p className="text-xs text-slate-400 italic">Used to label every comment and every wiki page</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categories.map((cat) => (
              <SchemaChip
                key={cat.code}
                code={cat.code}
                name={cat.name}
                description={cat.description}
                color={cat.color}
              />
            ))}
          </div>
        </section>

        {/* Section divider into the four paper figures. */}
        <section>
          <h3 className="serif text-xl font-semibold text-slate-900 mb-2">Figures from the paper</h3>
          <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
            Four figures lifted from the notebook-05 export pipeline, rendered as
            interactive Plotly visualizations. Hover any element for details, or click
            bubbles, bars, and tiles to drill into the underlying comments and videos.
          </p>
        </section>

        <FigureCard
          number={1}
          title="Knowledge bottleneck across the 10-class schema"
          caption="Each bubble represents a topic theme. Horizontal position encodes the share of comments that asked questions on that theme; vertical position encodes the share of comments that received useful answers. Bubble area scales with the total number of comments. Themes far below the diagonal are knowledge bottlenecks: high demand, low answer rate."
        >
          <BottleneckChart bottleneck={state.bottleneck} comments={state.comments} />
        </FigureCard>

        <FigureCard
          number={2}
          title="Frequency of canonical themes across the corpus"
          caption="Counts of comments tagged with each canonical theme from the theme dictionary, descending. Click any bar to surface sample comments tagged with that theme. The long tail captures niche topics that surface in fewer than ten comments each, while the head is dominated by code, sizing, and grounding questions."
        >
          <ThemeFrequencyChart themeFrequency={state.themeFrequency} comments={state.comments} />
        </FigureCard>

        <FigureCard
          number={3}
          title="Transcript topics treemap, weighted by total video views"
          caption="Treemap of the topics that appear in video transcripts. Tile area scales with the number of videos in the topic; color encodes the average view count per video. Click a tile to list the top videos contributing to that topic."
        >
          <TopicTreemap topicTreemap={state.topicTreemap} />
        </FigureCard>

        <FigureCard
          number={4}
          title="Data collection and comment analysis pipeline"
          caption="Three-panel summary of how the corpus was built. Panel A traces the YouTube search-to-transcript funnel by keyword. Panel B shows the comment harvesting yield per video. Panel C shows the question-filtering breakdown that produced the final labeled comment set. Hover any bar for stage definitions."
        >
          <DataPipelineChart dataPipeline={state.dataPipeline} />
        </FigureCard>

      </div>
    );
  }

  return { ResearchTab };
})();

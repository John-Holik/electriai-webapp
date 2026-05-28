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

  // Horizontal bar chart of the 76 canonical themes ranked by comment count.
  // Click a bar to reveal sample comments tagged with that theme (filtered
  // from the same comments.json the bottleneck chart uses).
  function ThemeFrequencyChart({ themeFrequency, comments }) {
    const divRef = useRef(null);
    const [selected, setSelected] = useState(null);

    useEffect(() => {
      const themes = themeFrequency.themes;
      // Reverse so the highest-count theme renders at the top of the bar chart.
      const names = themes.map(t => t.name).reverse();
      const counts = themes.map(t => t.count).reverse();
      const fontFamily = 'Calibri';
      const fontSize = 12;

      const traces = [{
        x: counts,
        y: names,
        type: 'bar',
        orientation: 'h',
        marker: { color: '#D3D3D3', line: { color: '#000000', width: 1 } },
        customdata: names,
        hovertemplate: '<b>%{y}</b><br>%{x:,} comments<extra></extra>',
        text: counts.map(c => c > 0 ? c.toLocaleString() : ''),
        textposition: 'outside',
        textfont: { family: fontFamily, size: fontSize, color: '#000000' },
        cliponaxis: false,
      }];

      const layout = {
        autosize: true,
        height: Math.max(600, names.length * 22),
        font: { family: fontFamily, size: fontSize, color: '#000000' },
        xaxis: {
          title: { text: 'Number of Comments', font: { family: fontFamily, size: fontSize, color: '#000000' } },
          tickfont: { family: fontFamily, size: fontSize, color: '#000000' },
          showgrid: false, zeroline: false,
        },
        yaxis: {
          automargin: true,
          tickfont: { family: fontFamily, size: fontSize, color: '#000000' },
        },
        margin: { t: 20, l: 8, r: 80, b: 48 },
        paper_bgcolor: 'white',
        plot_bgcolor: 'white',
        showlegend: false,
        hovermode: 'closest',
      };

      const div = divRef.current;
      const handler = (e) => {
        const pt = e.points && e.points[0];
        if (!pt) return;
        setSelected(pt.customdata);
      };

      Plotly.newPlot(div, traces, layout, { responsive: true, displaylogo: false })
        .then((gd) => { gd.on('plotly_click', handler); });

      return () => { Plotly.purge(div); };
    }, [themeFrequency]);

    // Filter the curated comment sample by theme presence in the Themes dict.
    const samples = useMemo(() => {
      if (!selected || !comments) return [];
      return comments.filter(c => c.themes && c.themes[selected] != null).slice(0, 5);
    }, [selected, comments]);

    return (
      <>
        <div ref={divRef} style={{ width: '100%' }} />
        <noscript>
          <img
            src="figures/theme_dictionary_frequency.svg"
            alt="Horizontal bar chart of canonical themes ranked by comment count."
            style={{ width: '100%', display: 'block' }}
          />
        </noscript>
        {selected && (
          <div className="mt-4 bg-slate-100 rounded-lg p-4 border border-slate-200">
            <div className="flex items-baseline justify-between mb-3">
              <h4 className="serif text-base font-semibold text-slate-900">
                Sample comments tagged with "{selected}"
              </h4>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >Clear</button>
            </div>
            {samples.length === 0 ? (
              <p className="text-sm text-slate-500 italic">
                No comments from the 200-row curated sample carry this theme. The full corpus has more.
              </p>
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

  // Treemap of transcript-level topics, tile area = video count, color = avg views.
  // Click a tile to list the top videos contributing to that topic.
  function TopicTreemap({ topicTreemap }) {
    const divRef = useRef(null);
    const [selected, setSelected] = useState(null);

    useEffect(() => {
      const topics = topicTreemap.topics;
      const labels = topics.map(t => t.topic);
      const values = topics.map(t => t.videoCount);
      const avgViews = topics.map(t => t.avgViews);
      const parents = topics.map(() => '');
      const fontFamily = 'Calibri';
      const fontSize = 12;

      const traces = [{
        type: 'treemap',
        labels,
        parents,
        values,
        customdata: topics.map(t => ([
          t.videoCount,
          Math.round(t.avgViews).toLocaleString(),
          t.avgWeight.toFixed(1),
        ])),
        text: topics.map(t => `${t.videoCount} videos<br>${Math.round(t.avgViews).toLocaleString()} avg views`),
        textinfo: 'label+text',
        textfont: { family: fontFamily, size: fontSize, color: '#000000' },
        hovertemplate:
          '<b>%{label}</b><br>' +
          '%{customdata[0]} videos · %{customdata[1]} avg views · %{customdata[2]}% avg weight<extra></extra>',
        marker: {
          colors: avgViews,
          colorscale: 'Blues',
          showscale: true,
          colorbar: {
            title: { text: 'Average<br>View Count', font: { family: fontFamily, size: fontSize } },
            tickfont: { size: fontSize },
            thickness: 12,
            len: 0.7,
          },
          line: { color: '#000000', width: 1 },
        },
        pathbar: { visible: false },
      }];

      const layout = {
        autosize: true,
        height: 480,
        font: { family: fontFamily, size: fontSize, color: '#000000' },
        margin: { t: 16, l: 8, r: 96, b: 8 },
        paper_bgcolor: 'white',
      };

      const div = divRef.current;
      const handler = (e) => {
        const pt = e.points && e.points[0];
        if (!pt) return;
        setSelected(pt.label);
      };

      Plotly.newPlot(div, traces, layout, { responsive: true, displaylogo: false })
        .then((gd) => { gd.on('plotly_click', handler); });

      return () => { Plotly.purge(div); };
    }, [topicTreemap]);

    const selectedTopic = useMemo(() => {
      if (!selected) return null;
      return topicTreemap.topics.find(t => t.topic === selected) || null;
    }, [selected, topicTreemap]);

    return (
      <>
        <div ref={divRef} style={{ width: '100%' }} />
        <noscript>
          <img
            src="figures/transcript_topics_treemap_views.svg"
            alt="Treemap of transcript topics where tile size reflects cumulative video views per topic."
            style={{ width: '100%', display: 'block' }}
          />
        </noscript>
        {selectedTopic && (
          <div className="mt-4 bg-slate-100 rounded-lg p-4 border border-slate-200">
            <div className="flex items-baseline justify-between mb-3">
              <h4 className="serif text-base font-semibold text-slate-900">
                Top videos in {selectedTopic.topic} ({selectedTopic.videoCount} videos total)
              </h4>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >Clear</button>
            </div>
            <ul className="space-y-2">
              {selectedTopic.topVideos.map((v, i) => (
                <li key={i} className="text-sm text-slate-700 flex items-baseline justify-between gap-3">
                  <a href={v.url} target="_blank" rel="noopener" className="underline truncate">{v.title}</a>
                  <span className="text-xs text-slate-500 whitespace-nowrap">
                    {v.views.toLocaleString()} views · {v.weight}% weight
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </>
    );
  }

  // Three-panel data pipeline summary: keywords (left), comment funnel (top-right),
  // question split (bottom-right). Tooltips carry stage definitions; no click drill-down.
  function DataPipelineChart({ dataPipeline }) {
    const divRef = useRef(null);

    useEffect(() => {
      const fontFamily = 'Calibri';
      const fontSize = 12;
      const barColor = '#B8B8B8';
      const barLine = { color: '#000000', width: 1 };

      const kwData = dataPipeline.keywords;
      const funnel = dataPipeline.funnel;
      const qa = dataPipeline.qaBreakdown;

      const traces = [
        {
          x: kwData.map(k => k.count),
          y: kwData.map(k => k.keyword),
          type: 'bar',
          orientation: 'h',
          marker: { color: barColor, line: barLine },
          text: kwData.map(k => k.count.toString()),
          textposition: 'outside',
          textfont: { family: fontFamily, size: fontSize, color: '#000000' },
          hovertemplate: '<b>%{y}</b><br>%{x:,} transcripts collected<extra></extra>',
          xaxis: 'x1', yaxis: 'y1',
          showlegend: false,
          cliponaxis: false,
        },
        {
          x: funnel.map(f => f.count),
          y: funnel.map(f => f.shortLabel),
          type: 'bar',
          orientation: 'h',
          marker: { color: barColor, line: barLine },
          text: funnel.map(f => f.count.toLocaleString()),
          textposition: 'outside',
          textfont: { family: fontFamily, size: fontSize, color: '#000000' },
          customdata: funnel.map(f => f.description),
          hovertemplate: '<b>%{y}</b><br>%{x:,} comments<br>%{customdata}<extra></extra>',
          xaxis: 'x2', yaxis: 'y2',
          showlegend: false,
          cliponaxis: false,
        },
        {
          x: qa.map(q => q.count),
          y: qa.map(q => q.label),
          type: 'bar',
          orientation: 'h',
          marker: { color: barColor, line: barLine },
          text: qa.map(q => `${q.count.toLocaleString()} (${q.percent.toFixed(1)}%)`),
          textposition: 'outside',
          textfont: { family: fontFamily, size: fontSize, color: '#000000' },
          customdata: qa.map(q => q.percent.toFixed(1)),
          hovertemplate: '<b>%{y}</b><br>%{x:,} threads (%{customdata}%)<extra></extra>',
          xaxis: 'x3', yaxis: 'y3',
          showlegend: false,
          cliponaxis: false,
        },
      ];

      const kwMax = Math.max(...kwData.map(k => k.count));
      const funnelMax = Math.max(...funnel.map(f => f.count));
      const qaMax = Math.max(...qa.map(q => q.count));

      const layout = {
        autosize: true,
        height: 540,
        font: { family: fontFamily, size: fontSize, color: '#000000' },
        paper_bgcolor: 'white',
        plot_bgcolor: 'white',
        showlegend: false,
        margin: { t: 28, l: 8, r: 8, b: 40 },
        annotations: [
          { x: 0, y: 1.03, xref: 'x1 domain', yref: 'y1 domain', text: 'a) Transcripts per keyword', showarrow: false, xanchor: 'left', font: { family: fontFamily, size: fontSize, color: '#000000' } },
          { x: 0, y: 1.10, xref: 'x2 domain', yref: 'y2 domain', text: 'b) Comment filtering funnel', showarrow: false, xanchor: 'left', font: { family: fontFamily, size: fontSize, color: '#000000' } },
          { x: 0, y: 1.10, xref: 'x3 domain', yref: 'y3 domain', text: 'c) Question vs non-question threads', showarrow: false, xanchor: 'left', font: { family: fontFamily, size: fontSize, color: '#000000' } },
        ],
        xaxis:  { domain: [0.00, 0.45], anchor: 'y1', range: [0, kwMax * 1.18],     tickformat: ',d', showgrid: false, zeroline: false },
        yaxis:  { domain: [0.00, 1.00], anchor: 'x1', automargin: true },
        xaxis2: { domain: [0.58, 1.00], anchor: 'y2', range: [0, funnelMax * 1.25], tickformat: ',d', showgrid: false, zeroline: false },
        yaxis2: { domain: [0.55, 1.00], anchor: 'x2', automargin: true },
        xaxis3: { domain: [0.58, 1.00], anchor: 'y3', range: [0, qaMax * 1.35],     tickformat: ',d', showgrid: false, zeroline: false },
        yaxis3: { domain: [0.00, 0.45], anchor: 'x3', automargin: true },
      };

      const div = divRef.current;
      Plotly.newPlot(div, traces, layout, { responsive: true, displaylogo: false });

      return () => { Plotly.purge(div); };
    }, [dataPipeline]);

    return (
      <>
        <div ref={divRef} style={{ width: '100%' }} />
        <noscript>
          <img
            src="figures/data_collection_comment_analysis.svg"
            alt="Three-panel figure showing transcripts collected per keyword, comments harvested per video, and the question-filtering breakdown."
            style={{ width: '100%', display: 'block' }}
          />
        </noscript>
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

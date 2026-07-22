/* Findings tab. Landing tab for the study: the question-taxonomy results
   lead (headline gap numbers, methods summary, Figures 1 to 3), followed by
   the foundation stage (10-class subject schema, legacy Figures 4 to 10,
   and the Table 1 classification metrics). */

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
      // The Plots.resize call forces an initial layout pass; without it the
      // colorbar can clip on first paint inside a flex/responsive container.
      Plotly.newPlot(div, traces, layout, { responsive: true, displaylogo: false })
        .then((gd) => {
          gd.on('plotly_click', handler);
          // Pointer cursor over clickable bubbles (data trace only) so users
          // know they can click. Plotly sets the drag-layer cursor via a class
          // with !important, so override it inline with the same priority.
          const dragEl = () => gd.querySelector('.nsewdrag');
          gd.on('plotly_hover', (e) => {
            const pt = e.points && e.points[0];
            const el = dragEl();
            if (el && pt && pt.curveNumber === 0) {
              el.style.setProperty('cursor', 'pointer', 'important');
            }
          });
          gd.on('plotly_unhover', () => {
            const el = dragEl();
            if (el) el.style.removeProperty('cursor');
          });
          Plotly.Plots.resize(gd);
        });

      return () => { Plotly.purge(div); };
    }, [bottleneck]);

    const samples = useMemo(() => {
      if (!selected || !comments) return [];
      return comments.filter(c => c.category === selected).slice(0, 5);
    }, [selected, comments]);

    return (
      <>
        {!selected && (
          <p className="text-xs text-slate-500 italic mb-2 pl-6">
            Tip: click any bubble to see sample comments from that theme.
          </p>
        )}
        <div ref={divRef} style={{ width: '100%', height: '640px' }} />
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

  // Obsidian-graph-style 3D theme co-occurrence network. Recreates the
  // VOSviewer map in-browser: nodes are themes (sized by prominence, colored
  // by community cluster), links are weighted co-occurrences. The graph JSON is
  // produced by src/web/build_vos_network.py (same clustering as the 2D paper
  // figure, so colors line up). 3d-force-graph computes the 3D layout itself, so
  // the JSON carries no coordinates. Mounted into a ref'd div like the Plotly
  // bubble chart above; the instance is disposed on unmount.
  function ThemeNetworkChart() {
    const divRef = useRef(null);
    const graphRef = useRef(null);
    const [error, setError] = useState(null);
    const [selected, setSelected] = useState(null);
    const [legend, setLegend] = useState([]);

    useEffect(() => {
      const div = divRef.current;
      if (!div || typeof ForceGraph3D === 'undefined') {
        if (typeof ForceGraph3D === 'undefined') {
          setError('3D graph library failed to load.');
        }
        return;
      }

      let disposed = false;

      fetch('./data/theme_network_graph.json')
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(data => {
          if (disposed || !divRef.current) return;

          // Edge opacity/width scaled by co-occurrence weight.
          const linkW = data.links.map(l => l.weight);
          const wMin = Math.min(...linkW);
          const wMax = Math.max(...linkW);
          const norm = (w) => (w - wMin) / (wMax - wMin + 1e-9);

          // Lookup for the click-to-inspect panel.
          const nodeById = new Map(data.nodes.map(n => [n.id, n]));
          const endId = (e) => (typeof e === 'object' && e !== null ? e.id : e);
          const neighbors = new Map();
          data.links.forEach(l => {
            const s = endId(l.source), t = endId(l.target);
            if (!neighbors.has(s)) neighbors.set(s, []);
            if (!neighbors.has(t)) neighbors.set(t, []);
            neighbors.get(s).push({ id: t, weight: l.weight });
            neighbors.get(t).push({ id: s, weight: l.weight });
          });

          // Legend: one row per cluster, labeled by its highest-weight theme,
          // ordered by cluster size (total weight) so the biggest groups lead.
          const clusters = new Map();
          data.nodes.forEach(n => {
            const c = clusters.get(n.cluster) ||
              { cluster: n.cluster, color: n.color, total: 0, top: '', topW: -1 };
            c.total += n.weight;
            c.color = n.color;
            if (n.weight > c.topW) { c.topW = n.weight; c.top = n.label; }
            clusters.set(n.cluster, c);
          });
          setLegend(Array.from(clusters.values()).sort((a, b) => b.total - a.total));

          const graph = ForceGraph3D()(divRef.current)
            .graphData(data)
            .backgroundColor('#E5ECF6')
            .nodeId('id')
            .nodeLabel(n => `<div style="color:#000000;font-family:Arial,sans-serif;font-weight:bold;">${n.label}</div>`)
            .nodeVal('val')
            // Links render flat black at low opacity; weight drives width only.
            .linkColor(() => '#000000')
            .linkWidth(l => 0.3 + norm(l.weight) * 2.4)
            .linkOpacity(0.18)
            .nodeThreeObjectExtend(false)
            // Render each node as an UNLIT sphere (MeshBasicMaterial) so the
            // cluster color shows at full saturation regardless of scene lighting.
            // The lit default material kept washing the colors out. A floating
            // label sprite sits above the larger nodes (Obsidian-style).
            .nodeThreeObject(node => {
              const group = new THREE.Group();
              const radius = Math.cbrt(node.val) * 3.4;
              const sphere = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 18, 18),
                new THREE.MeshBasicMaterial({ color: node.color })
              );
              group.add(sphere);
              if (node.val >= 4 && typeof SpriteText !== 'undefined') {
                const sprite = new SpriteText(node.label);
                sprite.color = '#0f172a';
                sprite.fontFace = 'Arial, Helvetica, sans-serif';
                sprite.fontWeight = 'bold';
                sprite.textHeight = Math.max(4.5, node.val);
                // Sit the text just above the top of the bubble.
                sprite.position.set(0, radius + sprite.textHeight * 0.5 + 3, 0);
                // Always draw on top so the node sphere can't occlude the label.
                sprite.material.depthTest = false;
                sprite.material.depthWrite = false;
                sprite.renderOrder = 10;
                group.add(sprite);
              }
              return group;
            })
            // Click a node: focus the camera on it and open the info panel.
            .onNodeClick(node => {
              const conns = (neighbors.get(node.id) || []).slice()
                .sort((a, b) => b.weight - a.weight);
              setSelected({
                label: node.label,
                weight: node.weight,
                cluster: node.cluster,
                color: node.color,
                degree: conns.length,
                top: conns.slice(0, 6).map(c => ({
                  label: (nodeById.get(c.id) || {}).label || c.id,
                  weight: c.weight,
                })),
              });
              const dist = 120;
              const hyp = Math.hypot(node.x, node.y, node.z) || 1;
              const r = 1 + dist / hyp;
              graph.cameraPosition(
                { x: node.x * r, y: node.y * r, z: node.z * r },
                node,
                1200
              );
            })
            .onBackgroundClick(() => setSelected(null))
            // Pointer cursor while hovering a node so its clickability is clear.
            .onNodeHover(node => {
              if (divRef.current) divRef.current.style.cursor = node ? 'pointer' : null;
            });

          // Spread the cloud out: stronger repulsion and longer links so the
          // graph isn't bunched up (stronger co-occurrence still pulls closer).
          graph.d3Force('charge').strength(-340);
          graph.d3Force('link').distance(l => 75 - norm(l.weight) * 32);

          const onResize = () => {
            if (!divRef.current) return;
            graph.width(divRef.current.clientWidth);
            graph.height(divRef.current.clientHeight);
          };
          onResize();
          window.addEventListener('resize', onResize);
          graphRef.current = { graph, onResize };
        })
        .catch(e => {
          if (!disposed) setError(e.message || 'Failed to load network.');
        });

      return () => {
        disposed = true;
        const ref = graphRef.current;
        if (ref) {
          window.removeEventListener('resize', ref.onResize);
          try { ref.graph._destructor && ref.graph._destructor(); } catch (e) {}
          graphRef.current = null;
        }
        if (div) div.innerHTML = '';
      };
    }, []);

    if (error) {
      return (
        <div className="p-6">
          <img
            src="figures/theme_networkmap_recreated.svg"
            alt="Recreated VOSviewer theme co-occurrence network: themes sized by prominence and colored by cluster."
            style={{ width: '100%', display: 'block' }}
          />
          <p className="text-xs text-slate-400 mt-2 italic">
            Interactive 3D view unavailable ({error}), showing the static figure.
          </p>
        </div>
      );
    }

    return (
      <div style={{ position: 'relative', width: '100%', height: '600px' }}>
        <div ref={divRef} style={{ width: '100%', height: '100%' }} />
        {legend.length > 0 && (
          <div style={{
            position: 'absolute', top: 12, left: 12, maxWidth: '230px',
            background: 'rgba(255, 255, 255, 0.9)',
            border: '1px solid rgba(15, 23, 42, 0.15)', borderRadius: '8px',
            padding: '8px 10px', color: '#0f172a', fontSize: '11px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
          }}>
            <div style={{ fontWeight: 600, marginBottom: '5px', color: '#334155' }}>
              Themes
            </div>
            {legend.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                <span style={{
                  display: 'inline-block', width: '10px', height: '10px',
                  borderRadius: '50%', background: c.color, flex: '0 0 auto',
                  border: '1px solid rgba(0,0,0,0.2)',
                }} />
                <span style={{ lineHeight: 1.2 }}>{c.top}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{
          position: 'absolute', left: 12, bottom: 12, pointerEvents: 'none',
          color: '#475569', fontSize: '11px',
        }}>
          Drag to rotate · scroll to zoom · click a node for details
        </div>
        {selected && (
          <div style={{
            position: 'absolute', top: 12, right: 12, width: '260px',
            maxHeight: 'calc(100% - 24px)', overflowY: 'auto',
            background: '#ffffff',
            border: '1px solid #C9CDD3', borderRadius: '8px',
            padding: '11px 13px', color: '#1A1C1F', fontSize: '12px',
            fontFamily: "Calibri, 'Segoe UI', sans-serif", lineHeight: 1.42,
            boxShadow: '0 2px 12px rgba(0,0,0,0.14)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontWeight: 700, fontSize: '12.5px', color: '#1A1C1F', lineHeight: 1.25 }}>
                <span style={{ display: 'inline-block', width: '9px', height: '9px', borderRadius: '50%', background: selected.color, marginRight: '6px', verticalAlign: 'middle' }} />
                {selected.label}
              </span>
              <span
                onClick={() => setSelected(null)}
                style={{
                  cursor: 'pointer', color: '#8A8F96',
                  fontSize: '15px', lineHeight: 1, fontWeight: 700,
                }}
                role="button"
                aria-label="Close"
              >×</span>
            </div>
            <div style={{ marginTop: '7px', color: '#44494F' }}>
              Prominence: <b style={{ color: '#1A1C1F' }}>{Math.round(selected.weight).toLocaleString()}</b>
            </div>
            <div style={{ marginTop: '2px', fontSize: '11px', color: '#8A8F96', lineHeight: 1.3 }}>
              How much this theme appears across the whole dataset. Each time it comes up in a video or comment it gets a relevance score; this sums those scores, so it rises with both how often the theme appears and how strongly it applies. This sets the node size.
            </div>
            <div style={{ marginTop: '4px', color: '#44494F' }}>Cluster: <b style={{ color: '#1A1C1F' }}>{selected.cluster + 1}</b></div>
            <div style={{ marginTop: '2px', color: '#44494F' }}>Connections: <b style={{ color: '#1A1C1F' }}>{selected.degree}</b></div>
            <div style={{ marginTop: '2px', fontSize: '11px', color: '#8A8F96', lineHeight: 1.3 }}>
              Number of other themes this one co-occurs with.
            </div>
            {selected.top.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <hr style={{ border: 'none', borderTop: '1px solid #ECEEF1', margin: '8px 0' }} />
                <div style={{ fontWeight: 700, color: '#1A1C1F' }}>Strongest co-occurrences</div>
                <div style={{ marginTop: '2px', fontSize: '11px', color: '#8A8F96', lineHeight: 1.3 }}>
                  Themes that appear in the same video or comment most often. The number is the connection strength: higher means they show up together more.
                </div>
                <ul style={{ marginTop: '4px', paddingLeft: '16px', listStyle: 'disc', color: '#44494F' }}>
                  {selected.top.map((c, i) => (
                    <li key={i} style={{ marginBottom: '2px' }}>
                      {c.label} <span style={{ color: '#8A8F96' }}>({Math.round(c.weight).toLocaleString()})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Inject a matplotlib-generated SVG inline, bind hover/click handlers per gid.
  // The SVG file carries id="<prefix>-N" attributes (set via Artist.set_gid in
  // build_web_interactive_svgs.py); the sidecar JSON tells us what each gid
  // represents. Visual is pixel-identical to the original paper figure.
  function MplInlineChart({ svgUrl, metaUrl, fallbackSvg, fallbackAlt, getTooltip, renderDrilldown }) {
    const containerRef = useRef(null);
    const [meta, setMeta]       = useState(null);
    const [selected, setSelected] = useState(null);
    const [tooltip, setTooltip] = useState(null);

    // Fetch SVG + sidecar JSON once.
    useEffect(() => {
      let cancelled = false;
      Promise.all([
        fetch(svgUrl).then(r => r.text()),
        fetch(metaUrl).then(r => r.json()),
      ]).then(([svgText, metaDoc]) => {
        if (cancelled) return;
        // Inject SVG as real DOM (not <img>) so its inner <g id="..."> elements
        // can receive events. Strip the XML prolog and DOCTYPE because they're
        // illegal inside an HTML document.
        const cleaned = svgText
          .replace(/<\?xml[^?]*\?>/, '')
          .replace(/<!DOCTYPE[^>]*>/, '')
          .trim();
        const div = containerRef.current;
        if (!div) return;
        div.innerHTML = cleaned;
        // Make the SVG scale to the FigureCard width while preserving the
        // matplotlib aspect ratio.
        const svg = div.querySelector('svg');
        if (svg) {
          svg.removeAttribute('width');
          svg.removeAttribute('height');
          svg.setAttribute('style', 'width: 100%; height: auto; display: block;');
        }
        setMeta(metaDoc);
      });
      return () => { cancelled = true; };
    }, [svgUrl, metaUrl]);

    // Once both DOM and metadata are ready, attach event listeners per gid.
    useEffect(() => {
      if (!meta) return;
      const div = containerRef.current;
      if (!div) return;
      const byGid = new Map(meta.elements.map(e => [e.gid, e]));
      const handlers = [];
      meta.elements.forEach(el => {
        const node = div.querySelector(`#${CSS.escape(el.gid)}`);
        if (!node) return;
        node.style.cursor = 'pointer';
        const onEnter = (ev) => {
          // Subtle highlight via SVG stroke-width on the bar/tile path.
          const path = node.querySelector('path');
          if (path) path.setAttribute('stroke-width', '2');
          const tip = getTooltip ? getTooltip(el, meta) : null;
          if (tip) setTooltip({ text: tip, x: ev.clientX, y: ev.clientY });
        };
        const onMove = (ev) => {
          setTooltip(t => t ? { ...t, x: ev.clientX, y: ev.clientY } : null);
        };
        const onLeave = () => {
          const path = node.querySelector('path');
          if (path) path.setAttribute('stroke-width', '1');
          setTooltip(null);
        };
        const onClick = () => {
          setSelected(el.gid);
        };
        node.addEventListener('mouseenter', onEnter);
        node.addEventListener('mousemove', onMove);
        node.addEventListener('mouseleave', onLeave);
        node.addEventListener('click', onClick);
        handlers.push({ node, onEnter, onMove, onLeave, onClick });
      });
      return () => {
        handlers.forEach(h => {
          h.node.removeEventListener('mouseenter', h.onEnter);
          h.node.removeEventListener('mousemove', h.onMove);
          h.node.removeEventListener('mouseleave', h.onLeave);
          h.node.removeEventListener('click', h.onClick);
        });
      };
    }, [meta, getTooltip]);

    const selectedEl = selected && meta ? meta.elements.find(e => e.gid === selected) : null;

    return (
      <>
        <div ref={containerRef} style={{ width: '100%', position: 'relative' }} />
        {tooltip && (
          <div
            className="fixed pointer-events-none bg-slate-900 text-white text-xs rounded px-2 py-1 shadow-lg z-50"
            style={{ left: tooltip.x + 12, top: tooltip.y + 12, maxWidth: '280px' }}
          >
            {tooltip.text}
          </div>
        )}
        {selectedEl && renderDrilldown && (
          <div className="mt-4 bg-slate-100 rounded-lg p-4 border border-slate-200">
            <div className="flex items-baseline justify-between mb-3">
              <div className="serif text-base font-semibold text-slate-900">
                {renderDrilldown.title(selectedEl)}
              </div>
              <button
                onClick={() => setSelected(null)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >Clear</button>
            </div>
            {renderDrilldown.body(selectedEl)}
          </div>
        )}
      </>
    );
  }

  // ─── Question taxonomy figures (data: taxonomy_figures.json) ─────────

  // Figure 1: stacked area of question type volume per year. Absolute
  // counts show both the volume surge and the mix; hover carries the
  // within-year share of each type.
  function TaxonomyTrendChart({ data }) {
    const divRef = useRef(null);
    useEffect(() => {
      if (!data || !divRef.current) return;
      const el = divRef.current;
      const traces = data.types.map((t) => ({
        x: data.years,
        y: t.counts,
        name: t.name,
        type: 'scatter',
        mode: 'lines',
        stackgroup: 'one',
        line: { width: 0.5, color: t.color },
        fillcolor: t.color + '99',
        customdata: t.counts.map((c, i) => (data.totals[i] ? (100 * c / data.totals[i]).toFixed(1) : '0.0')),
        hovertemplate: '%{y:,} questions (%{customdata}% of that year)<extra>' + t.name + '</extra>',
      }));
      Plotly.newPlot(el, traces, {
        margin: { l: 56, r: 8, t: 8, b: 40 },
        font: { family: 'Inter, system-ui, sans-serif', size: 11, color: '#334155' },
        xaxis: { tickmode: 'array', tickvals: data.years, fixedrange: true },
        yaxis: { title: { text: 'Classified questions per year', font: { size: 11 } }, fixedrange: true },
        hovermode: 'x unified',
        hoverlabel: { font: { size: 11 } },
        legend: { orientation: 'h', y: -0.12, font: { size: 10.5 } },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
      }, { responsive: true, displayModeBar: false });
      return () => Plotly.purge(el);
    }, [data]);
    if (!data) return null;
    return <div ref={divRef} style={{ width: '100%', height: 460 }} />;
  }

  // Figure 2: knowledge-gap quadrant. One bubble per question family
  // (20 or more member questions): x answer rate among replied, y share
  // never replied, bubble area member count, color question type. Dashed
  // lines mark the overall averages, so the upper-left region is the
  // bottleneck: heavily ignored and poorly resolved.
  function GapQuadrantChart({ data, meta }) {
    const divRef = useRef(null);
    useEffect(() => {
      if (!data || !data.length || !divRef.current) return;
      const el = divRef.current;
      const maxMembers = Math.max(...data.map((f) => f.members));
      const byType = new Map();
      for (const f of data) {
        if (!byType.has(f.code)) byType.set(f.code, { name: f.typeName, color: f.color, items: [] });
        byType.get(f.code).items.push(f);
      }
      const traces = [...byType.values()].map((g) => ({
        x: g.items.map((f) => f.answerRate),
        y: g.items.map((f) => f.neverShare),
        name: g.name,
        mode: 'markers',
        marker: {
          size: g.items.map((f) => f.members),
          sizemode: 'area',
          sizeref: (2 * maxMembers) / (38 * 38),
          sizemin: 4,
          color: g.color,
          opacity: 0.75,
          line: { width: 1, color: '#ffffff' },
        },
        customdata: g.items.map((f) => [f.label, f.members, f.answered]),
        hovertemplate: '<b>%{customdata[0]}</b><br>%{customdata[1]:,} questions, %{customdata[2]:,} answered'
          + '<br>answer rate among replied: %{x}%<br>never replied: %{y}%<extra>' + g.name + '</extra>',
      }));
      const vline = meta ? meta.overallAnswerRate : 70;
      const hline = meta ? meta.overallNeverShare : 60;
      // Leader-line callouts for the three extreme families, located by their
      // exact label strings in the loaded data so text and position stay in
      // sync with the figure data.
      const calloutFor = (label, text, ax, ay) => {
        const f = data.find((d) => d.label === label);
        if (!f) return null;
        return {
          x: f.answerRate, y: f.neverShare, text: text(f),
          showarrow: true, arrowwidth: 1, arrowcolor: '#64748b', ax, ay,
          font: { size: 10, color: '#334155' },
        };
      };
      const callouts = [
        calloutFor('Tools Workmanship and Techniques',
          (f) => `${f.label}: ${f.neverShare}% never replied`, -10, -30),
        calloutFor('Industrial Controls And Automation',
          (f) => `${f.label}: ${f.answerRate}% answered when replied`, 30, -36),
        calloutFor('Batteries Solar and Inverters',
          (f) => `${f.label}: ${f.answerRate}% answered when replied`, -60, 34),
      ].filter(Boolean);
      Plotly.newPlot(el, traces, {
        margin: { l: 56, r: 8, t: 8, b: 44 },
        font: { family: 'Inter, system-ui, sans-serif', size: 11, color: '#334155' },
        xaxis: { title: { text: 'Answer rate among replied questions (%)', font: { size: 11 } }, fixedrange: true },
        yaxis: { title: { text: 'Share of questions never replied to (%)', font: { size: 11 } }, fixedrange: true },
        shapes: [
          { type: 'line', x0: vline, x1: vline, yref: 'paper', y0: 0, y1: 1,
            line: { color: '#94a3b8', width: 1, dash: 'dot' } },
          { type: 'line', y0: hline, y1: hline, xref: 'paper', x0: 0, x1: 1,
            line: { color: '#94a3b8', width: 1, dash: 'dot' } },
        ],
        annotations: [
          { xref: 'paper', yref: 'paper', x: 0.01, y: 0.99, text: 'Ignored and unresolved',
            showarrow: false, font: { size: 10, color: '#b91c1c' } },
          { xref: 'paper', yref: 'paper', x: 0.99, y: 0.01, text: 'Well covered',
            showarrow: false, font: { size: 10, color: '#047857' }, xanchor: 'right' },
          // Overall-average labels pinned to the dashed reference lines; the
          // values come from taxonomy_figures.json meta, not hardcoded copy.
          { x: vline, yref: 'paper', y: 0.99, text: `overall average ${vline}% answered when replied`,
            showarrow: false, xanchor: 'left', xshift: 6, font: { size: 10, color: '#64748b' } },
          { xref: 'paper', x: 0.99, y: hline, text: `overall average ${hline}% never replied`,
            showarrow: false, xanchor: 'right', yshift: 10, font: { size: 10, color: '#64748b' } },
          ...callouts,
        ],
        hoverlabel: { font: { size: 11 } },
        legend: { orientation: 'h', y: -0.16, font: { size: 10.5 } },
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
      }, { responsive: true, displayModeBar: false });
      return () => Plotly.purge(el);
    }, [data, meta]);
    if (!data || !data.length) return null;
    return <div ref={divRef} style={{ width: '100%', height: 520 }} />;
  }

  // Figure 3: Sankey from question type to what its questions received:
  // one of the ten answer mechanisms or no reply at
  // all. Flow width is the number of questions; the answer mechanism is
  // the primary (first-listed) type on each question's replies.
  function QAFlowChart({ data }) {
    const divRef = useRef(null);
    useEffect(() => {
      if (!data || !divRef.current) return;
      const el = divRef.current;
      const qIndex = new Map(data.qTypes.map((t, i) => [t.code, i]));
      const aIndex = new Map(data.aTypes.map((t, i) => [t.code, data.qTypes.length + i]));
      const links = data.links.filter((l) => qIndex.has(l.q) && aIndex.has(l.a));
      const colorOf = new Map(data.qTypes.map((t) => [t.code, t.color]));
      Plotly.newPlot(el, [{
        type: 'sankey',
        orientation: 'h',
        arrangement: 'snap',
        node: {
          label: [...data.qTypes.map((t) => t.name), ...data.aTypes.map((t) => t.name)],
          color: [...data.qTypes.map((t) => t.color), ...data.aTypes.map((t) => t.color)],
          pad: 12,
          thickness: 14,
          line: { width: 0 },
          hovertemplate: '%{label}: %{value:,} questions<extra></extra>',
        },
        link: {
          source: links.map((l) => qIndex.get(l.q)),
          target: links.map((l) => aIndex.get(l.a)),
          value: links.map((l) => l.count),
          color: links.map((l) => colorOf.get(l.q) + '33'),
          hovertemplate: '%{source.label} → %{target.label}: %{value:,} questions<extra></extra>',
        },
      }], {
        margin: { l: 8, r: 8, t: 8, b: 8 },
        font: { family: 'Inter, system-ui, sans-serif', size: 11, color: '#334155' },
        hoverlabel: { font: { size: 11 } },
        paper_bgcolor: 'rgba(0,0,0,0)',
      }, { responsive: true, displayModeBar: false });
      return () => Plotly.purge(el);
    }, [data]);
    if (!data) return null;
    return <div ref={divRef} style={{ width: '100%', height: 560 }} />;
  }

  // Methods pipeline figure. Replaces the prose methods summary with a
  // visual flow: four stage cards (dataset, stage 1, stage 2, consolidation)
  // joined by arrows, a record-flow funnel showing where rows drop out, and
  // an outcome bar splitting the substantive questions by what they received.
  // Counts are fixed values from the taxonomy database and consolidation.
  function MethodsPipeline() {
    // Stage cards. Full Tailwind class strings are stored per card so the
    // CDN build sees every class name verbatim in the rendered DOM. The
    // pipeline uses cool hues (sky, indigo, violet, fuchsia) only; warm
    // traffic-light colors are reserved for the outcome bar below so the
    // two color systems never overlap.
    const stages = [
      {
        step: '1',
        label: 'Dataset',
        headline: '794',
        unit: 'YouTube videos collected',
        lines: [
          '404 videos have Q&A comment threads; 398 of them contribute at least one detected question to the taxonomy database',
          '16,862 viewer comment threads',
          'Comments span 2011 to 2025; scrape cutoff October 2025',
        ],
        card: 'bg-sky-50 border-sky-200',
        badge: 'bg-sky-500',
        accent: 'text-sky-700',
      },
      {
        step: '2',
        label: 'Stage 1 · GPT-5-mini',
        headline: '16,862',
        unit: 'comment threads classified',
        lines: [
          'Question and answer structure plus a ten-category subject schema per thread',
          'Balanced 100-comment subset human-validated through Qualtrics surveys (agreement metrics in Table 1)',
          'Output: 14,980 detected questions',
        ],
        card: 'bg-indigo-50 border-indigo-200',
        badge: 'bg-indigo-500',
        accent: 'text-indigo-700',
      },
      {
        step: '3',
        label: 'Stage 2 · GPT-5.6 Luna',
        headline: '14,980',
        unit: 'questions re-read and classified',
        lines: [
          'Medium reasoning effort under the frozen taxonomy instrument (v0)',
          'Ten substantive question types (Q1 to Q10) plus a social or rhetorical residual (Q11)',
          'Ten answer mechanisms (A1 to A10) for replied questions',
        ],
        card: 'bg-violet-50 border-violet-200',
        badge: 'bg-violet-500',
        accent: 'text-violet-700',
      },
      {
        step: '4',
        label: 'Consolidation (v1)',
        headline: '263',
        unit: 'recurring question families',
        lines: [
          'Grouped from the 12,933 substantive questions',
          '3,667 answered questions (of 5,149 replied) grouped into 204 answer families',
        ],
        card: 'bg-fuchsia-50 border-fuchsia-200',
        badge: 'bg-fuchsia-500',
        accent: 'text-fuchsia-700',
      },
    ];

    // Record-flow funnel. Bar width is proportional to the count that
    // survives each step; the drop line above a bar explains what was
    // removed between it and the bar before, and the right-hand label
    // gives the share of the original 16,862 threads that remains.
    const funnel = [
      { count: 16862, label: '16,862 comment threads (one candidate question each) enter Stage 1', bar: 'bg-sky-300' },
      { count: 14980, label: '14,980 detected questions enter Stage 2', drop: '1,882 threads with no question present are skipped', bar: 'bg-indigo-300' },
      { count: 12933, label: '12,933 substantive questions enter the gap analysis', drop: '2,047 social or rhetorical questions (Q11) are excluded', bar: 'bg-violet-300' },
    ];

    // Outcome split of the 12,933 substantive questions, worst outcome
    // first to match the headline finding that silence dominates. Fill
    // shades are chosen so the in-segment text meets contrast guidelines.
    // Percentages are rounded to one decimal, so they can sum to slightly
    // over 100.
    const outcomes = [
      { pct: 60.2, label: 'Never replied', detail: '7,784 questions (60.2% of substantive)', seg: 'bg-rose-600 text-white', dot: 'bg-rose-600' },
      { pct: 11.5, label: 'Replied without a substantive answer', detail: '1,482 questions (11.5% of substantive)', seg: 'bg-amber-400 text-slate-900', dot: 'bg-amber-400' },
      { pct: 28.4, label: 'Replied and answered', detail: '3,667 questions (28.4% of substantive; 71.2% of the 5,149 replied)', seg: 'bg-emerald-700 text-white', dot: 'bg-emerald-700' },
    ];

    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="serif text-lg font-semibold text-slate-900">Methods at a glance</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-3xl leading-relaxed">
          Two model stages take 794 collected videos to 263 recurring question families. The funnel shows where
          records drop out along the way, and the outcome bar shows what the substantive questions received.
        </p>

        {/* Stage cards joined by arrows: horizontal on desktop, stacked on mobile. */}
        <div className="mt-5 flex flex-col md:flex-row items-stretch gap-2">
          {stages.map((s, i) => (
            <React.Fragment key={s.label}>
              {i > 0 && (
                <div className="flex items-center justify-center text-slate-300 shrink-0">
                  <svg className="w-5 h-5 rotate-90 md:rotate-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
              <div className={`flex-1 min-w-0 border rounded-lg p-4 ${s.card}`}>
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0 ${s.badge}`}>{s.step}</span>
                  <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500">{s.label}</span>
                </div>
                <div className={`mt-2 text-2xl font-semibold tabular-nums ${s.accent}`}>{s.headline}</div>
                <div className="text-xs text-slate-500">{s.unit}</div>
                <ul className="mt-2 space-y-1 text-xs text-slate-600 leading-relaxed">
                  {s.lines.map((line) => (
                    <li key={line} className="flex gap-1.5">
                      <span className="text-slate-400 shrink-0">·</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </React.Fragment>
          ))}
        </div>

        {/* Record-flow funnel. */}
        <div className="mt-6">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Record flow</div>
          <div className="space-y-1">
            {funnel.map((f) => (
              <div key={f.label}>
                {f.drop && (
                  <div className="flex items-center gap-1.5 py-1 pl-1 text-[11px] text-rose-600">
                    <svg className="w-3 h-3 shrink-0" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v10.638l3.96-4.158a.75.75 0 111.08 1.04l-5.25 5.5a.75.75 0 01-1.08 0l-5.25-5.5a.75.75 0 111.08-1.04l3.96 4.158V3.75A.75.75 0 0110 3z" clipRule="evenodd" />
                    </svg>
                    <span>{f.drop}</span>
                  </div>
                )}
                <div className="relative h-6 bg-slate-100 rounded overflow-hidden">
                  <div className={`h-full rounded ${f.bar}`} style={{ width: `${(f.count / 16862 * 100).toFixed(1)}%` }} />
                  <div className="absolute inset-y-0 left-2 flex items-center text-[11px] font-medium text-slate-900 whitespace-nowrap">{f.label}</div>
                  {f.drop && (
                    <div className="absolute inset-y-0 right-2 hidden sm:flex items-center text-[10px] text-slate-500 whitespace-nowrap">
                      {(f.count / 16862 * 100).toFixed(1)}% of threads remain
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Outcome bar for the substantive questions. */}
        <div className="mt-6">
          <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-2">
            Outcomes for the 12,933 substantive questions
          </div>
          <div className="flex h-7 rounded overflow-hidden">
            {outcomes.map((o) => (
              <div key={o.label} className={`flex items-center justify-center text-[11px] font-medium ${o.seg}`} style={{ width: `${o.pct}%` }}>
                {o.pct}%
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-col sm:flex-row sm:flex-wrap gap-x-6 gap-y-1">
            {outcomes.map((o) => (
              <div key={o.label} className="flex items-start gap-1.5 text-[11px] text-slate-600 leading-relaxed">
                <span className={`w-2.5 h-2.5 rounded-sm mt-0.5 shrink-0 ${o.dot}`} />
                <span><span className="font-semibold text-slate-700">{o.label}:</span> {o.detail}</span>
              </div>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-slate-400">Percentages are rounded to one decimal and may not sum to exactly 100.</p>
        </div>
      </div>
    );
  }

  function ResearchTab({ state }) {
    const stats = state.stats || {};
    const kbMeta = state.kbMeta || {};
    const taxFigs = state.taxonomyFigures || {};
    const categories = state.categories || [];

    // Clicking a schema chip reveals sample comments from that category.
    const [selectedCat, setSelectedCat] = useState(null);
    const schemaSamples = useMemo(() => {
      if (!selectedCat || !state.comments) return [];
      return state.comments.filter(c => c.category === selectedCat).slice(0, 5);
    }, [selectedCat, state.comments]);

    // Stat card definitions. Each entry carries the raw value plus the
    // formatter used to render it, so the card can animate a count-up. The
    // two percentage cards read taxonomy_figures.json meta and render as
    // preformatted strings (no count-up) so the decimal survives.
    const taxMeta = taxFigs.meta || {};
    const statCards = [
      { label: 'Comments collected',       value: 93317,               format: formatNumber,  hint: 'all comments and replies before filtering' },
      { label: 'Video URLs collected',     value: 4959,                format: formatNumber,  hint: 'across all search keywords, before deduplication' },
      { label: 'Videos analyzed',          value: stats.totalVideos,   format: formatNumber,  hint: `${formatNumber(stats.videosWithQa)} with Q&A comments` },
      { label: 'Comment threads analyzed', value: stats.totalComments, format: formatNumber },
      { label: 'Unique themes',            value: stats.uniqueThemes,  format: formatNumber },
      { label: 'Total video views',        value: stats.totalViews,    format: formatCompact },
      { label: 'Substantive questions classified', value: 12933,       format: formatNumber,  hint: `${formatNumber(kbMeta.questionFamilies)} recurring question families` },
      { label: 'Never replied',            value: taxMeta.overallNeverShare != null ? `${taxMeta.overallNeverShare}%` : undefined, hint: '7,784 of 12,933 substantive questions' },
      { label: 'Answered when replied',    value: taxMeta.overallAnswerRate != null ? `${taxMeta.overallAnswerRate}%` : undefined, hint: '3,667 of 5,149 replied questions' },
    ];

    return (
      <div className="space-y-12 animate-fade py-8">

        {/* Findings intro: section heading and overview paragraphs. */}
        <section className="max-w-3xl">
          <h2 className="serif text-2xl sm:text-3xl font-semibold text-slate-900 leading-tight tracking-tight">
            Practitioner Knowledge Base for Electrical Construction
          </h2>
          <div className="text-slate-700 mt-5 leading-relaxed text-base space-y-4">
            <p>
              This project analyzes practitioner discussion on YouTube to identify knowledge bottlenecks in electrical construction: the kinds of questions field practitioners ask most but for which peer answers are hardest to find. Collection began with 4,959 video URLs gathered across all search keywords and 93,317 comments, including replies, pulled before any filtering. From that raw corpus, a working set of 794 videos and 16,862 comment threads was carried forward and passed through an automated classification pipeline that labeled each thread by its question and answer structure. An automated classifier then re-read all 14,980 detected questions and sorted them into a literature-grounded taxonomy of ten substantive question types (a residual class, Q11 social or rhetorical, is excluded from the gap analysis) and ten answer mechanisms (A1 to A10), plus a small untyped bucket for replied rows with no classified mechanism. The 12,933 substantive questions (Q1 to Q10) were consolidated into 263 recurring question families.
            </p>
            <p>
              The headline finding: 60.2 percent of substantive questions never received any reply, and when someone did reply, 71.2 percent of questions got a substantive answer. The dominant knowledge gap is silence, not wrong answers. This site presents the study figures, an explorer for the labeled comment threads, the annotated validation set, and an assistant grounded in a knowledge base compiled from the question taxonomy.
            </p>
          </div>
        </section>

        {/* Headline statistics grid. */}
        <section>
          <h3 className="serif text-xl font-semibold text-slate-900 mb-4">By the numbers</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {statCards.map((s) => (
              <StatCard key={s.label} label={s.label} value={s.value} hint={s.hint} format={s.format} />
            ))}
          </div>
        </section>

        {/* Methods at a glance: the two-stage pipeline as a visual figure
            (stage cards, record-flow funnel, outcome bar). */}
        <section>
          <MethodsPipeline />
        </section>

        {/* Question taxonomy section: what gets asked, how the mix shifted,
            and how questions get resolved. Data: taxonomy_figures.json. */}
        <div className="space-y-4">
          <section>
            <h3 className="serif text-xl font-semibold text-slate-900 mb-2">The question taxonomy</h3>
            <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
              Every extracted practitioner question ({kbMeta.questions ? formatNumber(kbMeta.questions) : '14,980'} in
              total) was classified into ten substantive question types (a residual class, Q11 social or rhetorical,
              is excluded from the gap analysis) and ten answer mechanisms (A1 to A10). The 12,933 substantive questions were consolidated
              into {kbMeta.questionFamilies || 263} recurring question families. Across the dataset, 60.2 percent of
              substantive questions never received any reply, and 71.2 percent of replied questions got a substantive
              answer. The three figures below summarize what practitioners ask, how the mix has shifted over the
              years, and how (or whether) their questions get resolved.
            </p>
            <ol className="list-decimal pl-5 mt-3 space-y-1 text-sm text-slate-600 max-w-3xl leading-relaxed">
              <li>Practice-justification questions (Q6) are the most ignored type: 67.4 percent never replied, and their answer rate when replied is second lowest at 61.2 percent.</li>
              <li>Sourcing questions (Q9) are the largest type (17.6 percent) and second most ignored (66.8 percent never replied), yet answered 79.0 percent of the time when replied.</li>
              <li>Content requests (Q10) have the worst answer rate among replied at 48.2 percent.</li>
              <li>Permissibility and compliance questions (Q1) are best served at 81.3 percent answered when replied.</li>
            </ol>
          </section>

          <FigureCard
            number={1}
            title="Question type mix by year"
            caption="Stacked question volume per year, split by primary question type. Dates are the publication dates of the question comments; the scrape cutoff is October 2025, so 2025 is a partial year. Hover any year for each type's count and its share of that year's questions. Resource identification and sourcing, conceptual, and permissibility questions are the largest substantive types overall, with practice-justification questions spiking in 2022. The gray band is the social or rhetorical residual (Q11), which is excluded from Figures 2 and 3. The chart covers 2018 through 2025 (14,834 of the 14,980 classified questions); 146 earlier comments dating back to 2011 are omitted."
            dataSource="taxonomy_figures.json, built by src/web/build_web_taxonomy_figures.py from the GPT-5.6 Luna taxonomy database (v0) and consolidation (v1)"
          >
            <TaxonomyTrendChart data={taxFigs.typeYear} />
          </FigureCard>
        </div>

        <FigureCard
          number={2}
          title="Knowledge gaps across question families"
          caption="One bubble per question family with at least 20 member questions. Horizontal position is the share of replied questions that actually got answered; vertical position is the share of the family's questions that never received any reply; bubble area scales with the number of member questions, and color marks the question type. Dotted lines mark the overall averages: 71.2 percent of replied questions get a substantive answer, and 60.2 percent of substantive questions never receive any reply. Families in the upper-left region are the knowledge bottleneck: heavily ignored and, even when engaged, poorly resolved. Hover any bubble for the family's counts."
          dataSource="taxonomy_figures.json, built by src/web/build_web_taxonomy_figures.py from the GPT-5.6 Luna taxonomy database (v0) and consolidation (v1)"
        >
          <GapQuadrantChart data={taxFigs.quadrant} meta={taxFigs.meta} />
        </FigureCard>

        <FigureCard
          number={3}
          title="How questions get resolved, from question type to answer mechanism"
          caption="Flow from each substantive question type (left) to what its questions received (right): one of the ten answer mechanisms of the answer taxonomy, a reply without a classified type, or no reply at all. Flow width is the number of questions; where a question drew several answer mechanisms, the primary (first-listed) one is counted. Mechanisms are grouped here for readability into resolving (A1 to A5: prescription, explanation, experience, code citation, correction, in blue) and engaging without resolving (A6 to A10: counter-question, referral, meta-response, speculation, social, in gray); the split is a presentation grouping, and the codebook defines the ten mechanisms without ranking them. All 12,933 substantive questions are shown; the largest destination, Never replied, absorbs 7,784 of them."
          dataSource="taxonomy_figures.json, built by src/web/build_web_taxonomy_figures.py from the GPT-5.6 Luna taxonomy database (v0) and consolidation (v1)"
        >
          <QAFlowChart data={taxFigs.flow} />
        </FigureCard>

        {/* Foundation section: the prior stage the taxonomy builds on. */}
        <section className="max-w-3xl">
          <h3 className="serif text-xl font-semibold text-slate-900 mb-2">
            Foundation: the dataset and the first-stage subject classification
          </h3>
          <p className="text-sm text-slate-600 leading-relaxed">
            The taxonomy above is built on this earlier stage: GPT-5-mini's first-pass classification of every
            comment thread into question and answer structure and a ten-category subject schema, human-validated on
            a balanced subset through Qualtrics surveys (Table 1).
          </p>
        </section>

        {/* 10-class schema cards. */}
        <section>
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="serif text-xl font-semibold text-slate-900">The 10-class schema</h3>
            <p className="text-xs text-slate-400 italic">Click a class to see sample comments</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {categories.map((cat) => (
              <SchemaChip
                key={cat.code}
                code={cat.code}
                name={cat.name}
                description={cat.description}
                color={cat.color}
                active={selectedCat === cat.name}
                onClick={() => setSelectedCat(selectedCat === cat.name ? null : cat.name)}
              />
            ))}
          </div>
          {selectedCat && (
            <div className="mt-4 bg-slate-100 rounded-lg p-4 border border-slate-200">
              <div className="flex items-baseline justify-between mb-3">
                <h4 className="serif text-base font-semibold text-slate-900">
                  Sample comments from {selectedCat}
                </h4>
                <button
                  onClick={() => setSelectedCat(null)}
                  className="text-xs text-slate-500 hover:text-slate-800"
                >Clear</button>
              </div>
              {schemaSamples.length === 0 ? (
                <p className="text-sm text-slate-500 italic">No curated samples for this class.</p>
              ) : (
                <ul className="space-y-3">
                  {schemaSamples.map((c) => (
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
        </section>

        {/* Section divider into the foundation figures. The intro and the first
            figure are grouped so the paragraph sits directly above the chart. */}
        <div className="space-y-4">
          <section>
            <h3 className="serif text-xl font-semibold text-slate-900 mb-2">Figures from the paper</h3>
            <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
              Figures 4 through 10 come from this foundation stage. Figure 4 is an interactive
              Plotly visualization (hover or click any bubble to inspect a subject category);
              Figure 5 is an interactive 3D knowledge-demand terrain you can drag and zoom.
            </p>
          </section>

          <FigureCard
            number={4}
            title="Knowledge bottleneck across the 10-class schema"
            caption="Each bubble is one of the ten subject categories. Horizontal position is the total number of questions asked in that category; vertical position is its overall resolution rate: the share of all its questions, including the majority that never received a reply, that ended with a substantive answer. Bubble area scales with the category's total comments, and color with the average view count of its videos. Dashed lines mark the mean resolution rate (26.5 percent) and the median question count, splitting the plot into four quadrants; quadrant IV (high volume, low resolution) is the knowledge bottleneck. Resolution rates here look low because the denominator is every question asked; Figure 2 separates the two stages, showing that most of the gap is questions that never get a reply at all, while replied questions are answered 71.2 percent of the time."
            dataSource="data/knowledge_bottleneck.json"
          >
            <BottleneckChart bottleneck={state.bottleneck} comments={state.comments} />
          </FigureCard>
        </div>

        <FigureCard
          number={5}
          title="Knowledge-demand terrain across the theme map"
          caption="A three-dimensional landscape built over the same theme co-occurrence map as Figure 6. Each theme raises a peak whose height scales with how often electricians ask about it, and the surface is colored by how often those questions actually get answered: warm terrain marks the knowledge bottleneck (high demand, few answers) while cool terrain marks well-covered themes. Two of the tallest warm peaks are conductor terminations and splicing and jobsite workflow, tools, and best practices: heavily asked but answered several points below the overall average (26 percent in the figure hover text, the same mean drawn at 26.5 percent in Figure 4). Drag to orbit, scroll to zoom, and hover any summit for its theme, question volume, and answer rate; the question volume shown is a relevance-weighted score, not a count of questions."
          dataSource="figures/theme_terrain_3d_interactive.html"
        >
          <iframe
            src="figures/theme_terrain_3d_interactive.html"
            title="Interactive 3D knowledge-demand terrain"
            loading="lazy"
            style={{ width: '100%', height: '560px', border: '0', display: 'block' }}
          />
        </FigureCard>

        <FigureCard
          number={6}
          title="Theme co-occurrence network"
          caption="Network of how themes co-occur across the dataset. Each node is a theme, sized by its prominence: how much the theme appears across all videos and comments, weighted by how strongly it applies. Node color marks the cluster a theme belongs to: themes are grouped using VOSviewer's modularity-based clustering (the smart local moving algorithm), so themes that frequently co-occur share a color. A link joins two themes that appear together, and its thickness shows the co-occurrence strength: how often they turn up in the same video or comment. Drag to rotate and scroll to zoom; hover a node for its theme, or click it to see its prominence, connections, and strongest co-occurrences."
          dataSource="data/theme_network_graph.json, built by src/web/build_vos_network.py"
        >
          <ThemeNetworkChart />
        </FigureCard>

        <FigureCard
          number={7}
          title="Per-video question demand, reach, and engagement"
          caption="One bubble per video in the labeled dataset. Horizontal position is the video's reach (total views, log scale) and vertical position is its question demand (number of question comments, log scale), so videos drift up and to the right as they draw more viewers and more questions. Bubble size scales with likes on the video, and color shows the share of that video's questions that were answered on the same warm-to-cool bottleneck scale used elsewhere: warm bubbles are high-demand, low-answer hotspots, cool bubbles are well-covered, and videos with fewer than five questions stay gray because their answered share is too noisy to trust. Hover any bubble for its views, question count, and answered rate; click any bubble to open the video on YouTube and read a few of the actual questions viewers asked on it."
          dataSource="figures/video_demand_map_interactive.html"
        >
          <iframe
            src="figures/video_demand_map_interactive.html"
            title="Interactive per-video question-demand map"
            loading="lazy"
            style={{ width: '100%', height: '560px', border: '0', display: 'block' }}
          />
        </FigureCard>

        <FigureCard
          number={8}
          title="Frequency of canonical themes across the dataset"
          caption="Counts of comments tagged with each canonical theme from the theme dictionary, descending. Hover any bar for its count; click to see sample comments tagged with that theme. The head is dominated by grounding, bonding, raceway, and conductor sizing themes, while the long tail thins out to niche low-voltage topics with only a handful of comments each."
          dataSource="figures/theme_dictionary_frequency_interactive.svg with data/theme_dictionary_frequency_interactive.json"
        >
          <MplInlineChart
            svgUrl="figures/theme_dictionary_frequency_interactive.svg"
            metaUrl="data/theme_dictionary_frequency_interactive.json"
            fallbackSvg="figures/theme_dictionary_frequency.svg"
            fallbackAlt="Horizontal bar chart of canonical themes ranked by comment count, with grounding and bonding themes at the top."
            getTooltip={(el, meta) => {
              const total = (meta && meta.elements)
                ? meta.elements.reduce((s, x) => s + (x.count || 0), 0)
                : 0;
              const pct = total > 0 ? (el.count / total * 100).toFixed(1) : '0.0';
              return `${el.theme}: ${el.count.toLocaleString()} comments (${pct}%)`;
            }}
            renderDrilldown={{
              title: (el) => `Sample comments tagged with "${el.theme}"`,
              body: (el) => {
                const samples = (state.comments || [])
                  .filter(c => c.themes && c.themes[el.theme] != null)
                  .slice(0, 5);
                if (samples.length === 0) {
                  return (
                    <p className="text-sm text-slate-500 italic">
                      No comments from the 200-row curated sample carry this theme. The full dataset has {el.count.toLocaleString()}.
                    </p>
                  );
                }
                return (
                  <ul className="space-y-3">
                    {samples.map(c => (
                      <li key={c.recordId} className="text-sm text-slate-700">
                        <p className="leading-relaxed">"{c.commentText}"</p>
                        <p className="text-xs text-slate-500 mt-1">
                          <a href={c.videoUrl} target="_blank" rel="noopener" className="underline">{c.videoTitle}</a>
                          {c.questionSummary ? ` · Q: ${c.questionSummary}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                );
              },
            }}
          />
        </FigureCard>

        <FigureCard
          number={9}
          title="Transcript topics treemap, weighted by total video views"
          caption="Treemap of the topics that appear in video transcripts. Tile area scales with the aggregate view count of every video that touches the topic, so larger tiles indicate where the audience is actually spending time. Hover any tile for averages; click to list the top videos in that topic."
          dataSource="figures/transcript_topics_treemap_views_interactive.svg with data/transcript_topics_treemap_views_interactive.json"
        >
          <MplInlineChart
            svgUrl="figures/transcript_topics_treemap_views_interactive.svg"
            metaUrl="data/transcript_topics_treemap_views_interactive.json"
            fallbackSvg="figures/transcript_topics_treemap_views.svg"
            fallbackAlt="Treemap of transcript topics where tile size reflects cumulative video views per topic."
            getTooltip={(el) =>
              `${el.topic}: ${el.videoCount} videos · ${Math.round(el.avgViews).toLocaleString()} average views · ${el.avgWeight.toFixed(1)}% average weight`
            }
            renderDrilldown={{
              title: (el) => `Top videos in ${el.topic} (${el.videoCount} videos total)`,
              body: (el) => (
                <ul className="space-y-2">
                  {el.topVideos.map((v, i) => (
                    <li key={i} className="text-sm text-slate-700 flex items-baseline justify-between gap-3">
                      <a href={v.url} target="_blank" rel="noopener" className="underline truncate">{v.title}</a>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {v.views.toLocaleString()} views · {v.weight}% weight
                      </span>
                    </li>
                  ))}
                </ul>
              ),
            }}
          />
        </FigureCard>

        <FigureCard
          number={10}
          title="Data collection and comment analysis pipeline"
          caption="Three-panel summary of how the dataset was built. Panel A traces the YouTube search-to-transcript funnel by keyword. Panel B shows the comment funnel from collected parent threads through filtering to the LLM-labeled question set. Panel C shows the question versus non-question breakdown of the labeled comment set. Hover any bar for its exact count; click for the stage definition."
          dataSource="figures/data_collection_comment_analysis_interactive.svg with data/data_collection_comment_analysis_interactive.json"
        >
          <MplInlineChart
            svgUrl="figures/data_collection_comment_analysis_interactive.svg"
            metaUrl="data/data_collection_comment_analysis_interactive.json"
            fallbackSvg="figures/data_collection_comment_analysis.svg"
            fallbackAlt="Three-panel figure showing transcripts collected per keyword, comments harvested per video, and the question-filtering breakdown."
            getTooltip={(el) => {
              if (el.panel === 'qa') {
                return `${el.label}: ${el.count.toLocaleString()} threads (${el.percent.toFixed(1)}%)`;
              }
              if (el.panel === 'funnel') {
                return `${el.label}: ${el.count.toLocaleString()} comments`;
              }
              return `${el.label}: ${el.count.toLocaleString()} transcripts`;
            }}
            renderDrilldown={{
              title: (el) => {
                if (el.panel === 'qa') return `${el.label}: ${el.count.toLocaleString()} threads (${el.percent.toFixed(1)}%)`;
                if (el.panel === 'funnel') return `${el.label}: ${el.count.toLocaleString()} comments`;
                return `Keyword "${el.label}": ${el.count.toLocaleString()} transcripts`;
              },
              body: (el) => {
                if (el.panel === 'qa') {
                  const samples = el.samples || [];
                  if (samples.length === 0) {
                    return <p className="text-sm text-slate-700 leading-relaxed">{el.description}</p>;
                  }
                  return (
                    <div>
                      <p className="text-sm text-slate-700 leading-relaxed mb-4">{el.description}</p>
                      <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-2">
                        {samples.length} sample {samples.length === 1 ? 'thread' : 'threads'}
                      </div>
                      <ul className="space-y-3">
                        {samples.map((s, i) => (
                          <li key={s.commentId || i} className="bg-white border border-slate-200 rounded-md p-3">
                            <a
                              href={s.videoUrl}
                              target="_blank"
                              rel="noopener"
                              className="text-xs text-slate-600 hover:text-slate-900 underline underline-offset-2 block truncate mb-2"
                              title={s.videoTitle}
                            >
                              {s.videoTitle}
                            </a>
                            <p className="text-sm text-slate-800 leading-relaxed serif whitespace-pre-wrap">
                              {s.commentText}
                            </p>
                            {s.questionExcerpt && (
                              <p className="text-xs text-slate-600 mt-2 italic">
                                <span className="uppercase tracking-wider text-[10px] font-semibold not-italic text-slate-500 mr-1">Q:</span>
                                {s.questionExcerpt}
                              </p>
                            )}
                            {s.answerSummary && (
                              <p className="text-xs text-slate-600 mt-1 italic">
                                <span className="uppercase tracking-wider text-[10px] font-semibold not-italic text-slate-500 mr-1">A:</span>
                                {s.answerSummary}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                }
                if (el.panel === 'keywords') {
                  return (
                    <div>
                      <p className="text-sm text-slate-700 leading-relaxed mb-3">{el.description}</p>
                      <a
                        href="#fig-8"
                        className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900 underline underline-offset-2"
                      >
                        See Figure 8, theme frequency across the dataset ↑
                      </a>
                    </div>
                  );
                }
                if (el.panel === 'funnel') {
                  return (
                    <div>
                      <p className="text-sm text-slate-700 leading-relaxed mb-3">{el.description}</p>
                      <a
                        href="#fig-9"
                        className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900 underline underline-offset-2"
                      >
                        See Figure 9, transcript topics treemap ↑
                      </a>
                    </div>
                  );
                }
                return <p className="text-sm text-slate-700 leading-relaxed">{el.description}</p>;
              },
            }}
          />
        </FigureCard>

        {/* Table 1, per-category classification metrics on consensus subset. */}
        <figure className="bg-white border border-slate-200 rounded-lg overflow-hidden mt-8">
          <header className="px-6 pt-5 pb-4 border-b border-slate-100 space-y-2">
            <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 font-semibold">
              Table 1
            </div>
            <h4 className="serif text-lg font-semibold text-slate-900">
              Per-category GPT-5-mini subject-classification metrics on consensus comments
            </h4>
            <p className="text-sm text-slate-700 leading-relaxed serif">
              Per-category precision, recall, and F1 scores for LLM classification evaluated on consensus comments only (N = 67 comments where a student majority label was established independently of the LLM).
            </p>
          </header>
          <div className="bg-stone-50 px-6 py-5 overflow-x-auto">
            <table className="w-full text-sm text-slate-800 serif tabular-nums">
              <thead>
                <tr className="border-b border-slate-300">
                  <th className="text-left py-2 pr-4 font-semibold">Category</th>
                  <th className="text-right py-2 px-3 font-semibold">Precision</th>
                  <th className="text-right py-2 px-3 font-semibold">Recall</th>
                  <th className="text-right py-2 px-3 font-semibold">F1</th>
                  <th className="text-right py-2 pl-3 font-semibold">Support</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Low-Voltage, Communications, and Control Systems</td>
                  <td className="text-right py-2 px-3">0.889</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">0.941</td>
                  <td className="text-right py-2 pl-3">8</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Motors, HVAC, and Specialized Power Loads*</td>
                  <td className="text-right py-2 px-3">0.250</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">0.400</td>
                  <td className="text-right py-2 pl-3">1</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Grounding, Bonding, and Fault Management</td>
                  <td className="text-right py-2 px-3">0.900</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">0.947</td>
                  <td className="text-right py-2 pl-3">9</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Overcurrent, Short-Circuit, and Protective Devices</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 pl-3">9</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Renewable Energy, EV, and Energy Management Systems*</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 pl-3">1</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Devices, Lighting, and Utilization Equipment</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">0.909</td>
                  <td className="text-right py-2 px-3">0.952</td>
                  <td className="text-right py-2 pl-3">11</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Conductors, Raceway, and Physical Routing</td>
                  <td className="text-right py-2 px-3">0.889</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">0.941</td>
                  <td className="text-right py-2 pl-3">8</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Code Interpretation, Safety, and Field Operations</td>
                  <td className="text-right py-2 px-3">0.900</td>
                  <td className="text-right py-2 px-3">0.900</td>
                  <td className="text-right py-2 px-3">0.900</td>
                  <td className="text-right py-2 pl-3">10</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Power Distribution and Service Infrastructure</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">0.500</td>
                  <td className="text-right py-2 px-3">0.667</td>
                  <td className="text-right py-2 pl-3">4</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Other/Unmapped</td>
                  <td className="text-right py-2 px-3">0.333</td>
                  <td className="text-right py-2 px-3">0.167</td>
                  <td className="text-right py-2 px-3">0.222</td>
                  <td className="text-right py-2 pl-3">6</td>
                </tr>
                <tr className="border-t-2 border-slate-300">
                  <td className="py-2 pr-4 font-semibold">Macro Avg</td>
                  <td className="text-right py-2 px-3">0.816</td>
                  <td className="text-right py-2 px-3">0.848</td>
                  <td className="text-right py-2 px-3">0.797</td>
                  <td className="text-right py-2 pl-3">67</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-semibold">Weighted Avg</td>
                  <td className="text-right py-2 px-3">0.874</td>
                  <td className="text-right py-2 px-3">0.866</td>
                  <td className="text-right py-2 px-3">0.858</td>
                  <td className="text-right py-2 pl-3">67</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-semibold">Accuracy</td>
                  <td className="text-right py-2 px-3 text-slate-400">&middot;</td>
                  <td className="text-right py-2 px-3 text-slate-400">&middot;</td>
                  <td className="text-right py-2 px-3">0.866</td>
                  <td className="text-right py-2 pl-3">67</td>
                </tr>
              </tbody>
            </table>
          </div>
          <figcaption className="px-6 py-3 border-t border-slate-100 space-y-1">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              * Insufficient data (support &lt; 3); metrics should be interpreted with caution.
            </p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Cohen&rsquo;s &kappa; = 0.847 (&ldquo;almost perfect&rdquo; agreement, Landis and Koch 1977).
            </p>
          </figcaption>
        </figure>

      </div>
    );
  }

  return { ResearchTab };
})();

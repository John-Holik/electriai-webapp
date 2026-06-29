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
      // The Plots.resize call forces an initial layout pass; without it the
      // colorbar can clip on first paint inside a flex/responsive container.
      Plotly.newPlot(div, traces, layout, { responsive: true, displaylogo: false })
        .then((gd) => {
          gd.on('plotly_click', handler);
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

  // Obsidian-graph-style 3D theme co-occurrence network. Recreates the
  // VOSviewer map in-browser: nodes are themes (sized by co-occurrence strength, colored
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

          // Lookups for link coloring and the click-to-inspect panel.
          const nodeById = new Map(data.nodes.map(n => [n.id, n]));
          const colorById = new Map(data.nodes.map(n => [n.id, n.color]));
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
            // Color the links by their source theme's cluster color (was flat gray).
            .linkColor(() => '#000000')
            .linkWidth(l => 0.3 + norm(l.weight) * 2.4)
            .linkOpacity(0.18)
            .nodeThreeObjectExtend(false)
            // Render each node as an UNLIT sphere (MeshBasicMaterial) so the
            // cluster color shows at full saturation regardless of scene lighting
            // — the lit default material kept washing the colors out. A floating
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
            .onBackgroundClick(() => setSelected(null));

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
            alt="Recreated VOSviewer theme co-occurrence network: themes sized by co-occurrence strength and colored by cluster."
            style={{ width: '100%', display: 'block' }}
          />
          <p className="text-xs text-slate-400 mt-2 italic">
            Interactive 3D view unavailable ({error}) — showing the static figure.
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
            background: 'rgba(15, 23, 42, 0.92)',
            border: `1px solid ${selected.color}`, borderRadius: '8px',
            padding: '12px 14px', color: '#e2e8f0', fontSize: '12px',
            boxShadow: '0 4px 16px rgba(0,0,0,0.45)',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <span style={{ fontWeight: 600, color: selected.color, lineHeight: 1.25 }}>
                {selected.label}
              </span>
              <button
                onClick={() => setSelected(null)}
                style={{
                  background: 'none', border: 'none', color: '#94a3b8',
                  fontSize: '18px', lineHeight: 1, cursor: 'pointer', padding: 0,
                }}
                aria-label="Close"
              >×</button>
            </div>
            <div style={{ marginTop: '8px' }}>
              Prominence: <span style={{ color: '#f1f5f9' }}>{Math.round(selected.weight).toLocaleString()}</span>
            </div>
            <div style={{ marginTop: '2px', fontSize: '11px', color: '#94a3b8', lineHeight: 1.3 }}>
              How much this theme appears across the whole dataset. Each time it comes up in a video or comment it gets a relevance score; this sums those scores, so it rises with both how often the theme appears and how strongly it applies. This sets the node size.
            </div>
            <div>Cluster: <span style={{ color: '#f1f5f9' }}>{selected.cluster + 1}</span></div>
            <div>Connections: <span style={{ color: '#f1f5f9' }}>{selected.degree}</span></div>
            <div style={{ marginTop: '2px', fontSize: '11px', color: '#94a3b8', lineHeight: 1.3 }}>
              Number of other themes this one co-occurs with.
            </div>
            {selected.top.length > 0 && (
              <div style={{ marginTop: '10px' }}>
                <div style={{ fontWeight: 600, color: '#cbd5e1' }}>Strongest co-occurrences</div>
                <div style={{ marginTop: '2px', fontSize: '11px', color: '#94a3b8', lineHeight: 1.3 }}>
                  Themes that appear in the same video or comment most often. The number is the connection strength: higher means they show up together more.
                </div>
                <ul style={{ marginTop: '4px', paddingLeft: '16px', listStyle: 'disc' }}>
                  {selected.top.map((c, i) => (
                    <li key={i} style={{ marginBottom: '2px' }}>
                      {c.label} <span style={{ color: '#94a3b8' }}>({Math.round(c.weight).toLocaleString()})</span>
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
  function MplInlineChart({ svgUrl, metaUrl, fallbackSvg, fallbackAlt, onElementClick, getTooltip, gidPrefix, renderDrilldown }) {
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
          if (onElementClick) onElementClick(el);
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
    }, [meta, getTooltip, onElementClick]);

    const selectedEl = selected && meta ? meta.elements.find(e => e.gid === selected) : null;

    return (
      <>
        <div ref={containerRef} style={{ width: '100%', position: 'relative' }}>
          {/* Fallback shown until the SVG fetch resolves; replaced on inject. */}
          <noscript>
            <img src={fallbackSvg} alt={fallbackAlt} style={{ width: '100%', display: 'block' }} />
          </noscript>
        </div>
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
              {' '}knowledge-base pages distilled from the underlying dataset.
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

        {/* Section divider into the paper figures. */}
        <section>
          <h3 className="serif text-xl font-semibold text-slate-900 mb-2">Figures from the paper</h3>
          <p className="text-sm text-slate-600 max-w-3xl leading-relaxed">
            Figures lifted from the notebook-05 export pipeline. The first chart is an
            interactive Plotly visualization (hover or click any bubble to inspect a
            theme); the second is an interactive 3D theme co-occurrence network you can
            drag and zoom.
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
          title="Theme co-occurrence network"
          caption="Network of how themes co-occur across the dataset. Each node is a theme, sized by its prominence: how much the theme appears across all videos and comments, weighted by how strongly it applies. Node color marks the cluster a theme belongs to: themes are grouped using VOSviewer's modularity-based clustering (the smart local moving algorithm), so themes that frequently co-occur share a color. A link joins two themes that appear together, and its thickness shows the co-occurrence strength: how often they turn up in the same video or comment. Drag to rotate and scroll to zoom; hover a node for its theme, or click it to see its prominence, connections, and strongest co-occurrences."
        >
          <ThemeNetworkChart />
        </FigureCard>

        <FigureCard
          number={3}
          title="Frequency of canonical themes across the dataset"
          caption="Counts of comments tagged with each canonical theme from the theme dictionary, descending. Hover any bar for its count; click to see sample comments tagged with that theme. The long tail captures niche topics that surface in fewer than ten comments each, while the head is dominated by code, sizing, and grounding questions."
        >
          <MplInlineChart
            svgUrl="figures/theme_dictionary_frequency_interactive.svg"
            metaUrl="data/theme_dictionary_frequency_interactive.json"
            fallbackSvg="figures/theme_dictionary_frequency.svg"
            fallbackAlt="Horizontal bar chart of canonical themes ranked by comment count, with code interpretation and sizing themes at the top."
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
          number={4}
          title="Transcript topics treemap, weighted by total video views"
          caption="Treemap of the topics that appear in video transcripts. Tile area scales with the aggregate view count of every video that touches the topic, so larger tiles indicate where the audience is actually spending time. Hover any tile for averages; click to list the top videos in that topic."
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
          number={5}
          title="Data collection and comment analysis pipeline"
          caption="Three-panel summary of how the dataset was built. Panel A traces the YouTube search-to-transcript funnel by keyword. Panel B shows the comment harvesting yield per video. Panel C shows the question-filtering breakdown that produced the final labeled comment set. Hover any bar for its exact count; click for the stage definition."
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
                        href="#fig-3"
                        className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900 underline underline-offset-2"
                      >
                        See Figure 3, theme frequency across the dataset ↓
                      </a>
                    </div>
                  );
                }
                if (el.panel === 'funnel') {
                  return (
                    <div>
                      <p className="text-sm text-slate-700 leading-relaxed mb-3">{el.description}</p>
                      <a
                        href="#fig-4"
                        className="inline-flex items-center gap-1 text-xs text-slate-700 hover:text-slate-900 underline underline-offset-2"
                      >
                        See Figure 4, transcript topics treemap ↓
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
              Per-category LLM classification metrics on consensus comments
            </h4>
            <p className="text-sm text-slate-700 leading-relaxed serif">
              Per-category precision, recall, and F1 scores for LLM classification evaluated on consensus comments only (N = 69 comments where a student majority label was established independently of the LLM).
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
                  <td className="py-2 pr-4">Low-Voltage, Communications, and Control Systems*</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 pl-3">1.000</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Motors, HVAC, and Specialized Power Loads*</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 pl-3">1.000</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Grounding, Bonding, and Fault Management</td>
                  <td className="text-right py-2 px-3">0.923</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">0.960</td>
                  <td className="text-right py-2 pl-3">12.000</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Overcurrent, Short-Circuit, and Protective Devices</td>
                  <td className="text-right py-2 px-3">0.889</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">0.941</td>
                  <td className="text-right py-2 pl-3">8.000</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Renewable Energy, EV, and Energy Management Systems*</td>
                  <td className="text-right py-2 px-3">0.667</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">0.800</td>
                  <td className="text-right py-2 pl-3">2.000</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Devices, Lighting, and Utilization Equipment</td>
                  <td className="text-right py-2 px-3">0.857</td>
                  <td className="text-right py-2 px-3">0.857</td>
                  <td className="text-right py-2 px-3">0.857</td>
                  <td className="text-right py-2 pl-3">7.000</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Conductors, Raceway, and Physical Routing</td>
                  <td className="text-right py-2 px-3">0.938</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">0.968</td>
                  <td className="text-right py-2 pl-3">15.000</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Code Interpretation, Safety, and Field Operations</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">0.800</td>
                  <td className="text-right py-2 px-3">0.889</td>
                  <td className="text-right py-2 pl-3">5.000</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4">Power Distribution and Service Infrastructure</td>
                  <td className="text-right py-2 px-3">0.636</td>
                  <td className="text-right py-2 px-3">0.778</td>
                  <td className="text-right py-2 px-3">0.700</td>
                  <td className="text-right py-2 pl-3">9.000</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4">Other/Unmapped</td>
                  <td className="text-right py-2 px-3">1.000</td>
                  <td className="text-right py-2 px-3">0.444</td>
                  <td className="text-right py-2 px-3">0.615</td>
                  <td className="text-right py-2 pl-3">9.000</td>
                </tr>
                <tr className="border-t-2 border-slate-300">
                  <td className="py-2 pr-4 font-semibold">Macro Avg</td>
                  <td className="text-right py-2 px-3">0.891</td>
                  <td className="text-right py-2 px-3">0.888</td>
                  <td className="text-right py-2 px-3">0.873</td>
                  <td className="text-right py-2 pl-3">69.000</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="py-2 pr-4 font-semibold">Weighted Avg</td>
                  <td className="text-right py-2 px-3">0.889</td>
                  <td className="text-right py-2 px-3">0.870</td>
                  <td className="text-right py-2 px-3">0.862</td>
                  <td className="text-right py-2 pl-3">69.000</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-semibold">Accuracy</td>
                  <td className="text-right py-2 px-3 text-slate-400">&middot;</td>
                  <td className="text-right py-2 px-3 text-slate-400">&middot;</td>
                  <td className="text-right py-2 px-3">0.870</td>
                  <td className="text-right py-2 pl-3">69.000</td>
                </tr>
              </tbody>
            </table>
          </div>
          <figcaption className="px-6 py-3 border-t border-slate-100 space-y-1">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              * Insufficient data (support &lt; 3); metrics should be interpreted with caution.
            </p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              Cohen&rsquo;s &kappa; = 0.848 (&ldquo;almost perfect&rdquo; agreement, Landis and Koch 1977).
            </p>
          </figcaption>
        </figure>

      </div>
    );
  }

  return { ResearchTab };
})();

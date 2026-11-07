import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowsOutSimple, Globe, HandHeart, MapPin, Minus, Plus } from "@phosphor-icons/react";
import { causes as catalogue } from "../data.js";
import countries from "../geo/world.json";
import { buildRegionImpact, countryPath, coverageTone, projectPoint } from "../regionImpact.js";
import "./GlobalImpactMap.css";

const currency = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", notation: "compact", maximumFractionDigits: 1 });
const percent = (value) => value === null ? "—" : `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value)}%`;
const shapes = countries.map((country) => ({ ...country, path: countryPath(country.geometry) }));
const tones = { underserved: "#d67d64", building: "#4183c5", supported: "#298b80", unknown: "#8996a8" };

function RegionNumbers({ region, source, receiptTotal }) {
  return <dl className="impact-map-numbers">
    <div><dt>Campaign funding</dt><dd>{region.fundingKnown ? currency.format(region.raised) : "Not available"}</dd><small>of {region.fundingKnown ? currency.format(region.goal) : "unknown goal"}</small></div>
    <div><dt>Funding coverage</dt><dd>{percent(region.coverage)}</dd><small>Campaign funding ÷ goal</small></div>
    <div><dt>{source === "live" ? "Sandbox receipts" : "Selected feed receipts"}</dt><dd>{currency.format(region.received)}</dd><small>{region.receiptCount} completed {region.receiptCount === 1 ? "allocation" : "allocations"}</small></div>
    <div><dt>Share of contributions</dt><dd>{percent(region.share)}</dd><small>{receiptTotal ? `Of ${currency.format(receiptTotal)} in the selected feed` : "No receipts in the selected feed yet"}</small></div>
  </dl>;
}

export function GlobalImpactMap({ dashboard }) {
  const [source, setSource] = useState("live");
  const [selectedId, setSelectedId] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [extent, setExtent] = useState("active");
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: 900, height: 440 });
  const canvas = useRef(null);
  const dragging = useRef(null);
  const model = useMemo(() => buildRegionImpact(dashboard, catalogue, countries, source), [dashboard, source]);
  const available = [...model.regions, ...(model.unlocated ? [model.unlocated] : [])];
  const selected = available.find((region) => region.id === selectedId) || available[0];
  const hovered = model.regions.find((region) => region.id === hoveredId);
  const activeIds = new Set(model.regions.map((region) => region.id));
  const maxGap = Math.max(1, ...model.regions.map((region) => region.remaining));
  const markerMaximum = extent === "world" ? 12 : size.width < 500 ? 19 : 29;
  const markerMinimum = extent === "world" ? 4 : size.width < 500 ? 6 : 8;

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const view = useMemo(() => {
    let x = 0, y = 15, width = 1000, height = 440;
    if (extent === "active" && model.regions.length) {
      const points = model.regions.map((region) => projectPoint(region.coordinates));
      x = Math.min(...points.map((point) => point[0])) - 28;
      y = Math.min(...points.map((point) => point[1])) - 22;
      width = Math.max(85, Math.max(...points.map((point) => point[0])) - x + 28);
      height = Math.max(65, Math.max(...points.map((point) => point[1])) - y + 22);
    }
    const ratio = size.width / Math.max(1, size.height);
    if (width / height > ratio) { const next = width / ratio; y -= (next - height) / 2; height = next; }
    else { const next = height * ratio; x -= (next - width) / 2; width = next; }
    return { x: x + width / 2 - width / zoom / 2 + pan.x, y: y + height / 2 - height / zoom / 2 + pan.y, width: width / zoom, height: height / zoom };
  }, [extent, model.regions, size, zoom, pan]);

  const resetView = (next = extent) => { setExtent(next); setZoom(1); setPan({ x: 0, y: 0 }); setHoveredId(null); };
  const screenScale = view.width / Math.max(1, size.width);
  const tooltipPoint = hovered ? projectPoint(hovered.coordinates) : null;
  const tooltipX = tooltipPoint ? (tooltipPoint[0] - view.x) / view.width * 100 : 0;
  const tooltipY = tooltipPoint ? (tooltipPoint[1] - view.y) / view.height * 100 : 0;
  const greatestGap = model.regions[0];

  return <section className="impact-map-section" aria-labelledby="global-impact-map-title">
    <div className="impact-map-header">
      <div><span className="eyebrow"><Globe size={17} weight="duotone" /> Global Impact Map</span><h2 id="global-impact-map-title">See where support is needed.</h2><p>Follow support to the places causes serve. Find the gaps still waiting to be filled.</p></div>
      <div className="impact-map-source"><span>Contribution receipt source</span><div role="group" aria-label="Map contribution receipt source"><button aria-pressed={source === "live"} onClick={() => setSource("live")}>Sandbox captures</button><button aria-pressed={source === "all"} onClick={() => setSource("all")}>Demo + Sandbox</button></div></div>
    </div>

    <div className="impact-map-highlights">
      <div><span>Remaining campaign gaps</span><strong>{currency.format(model.totalGap)}</strong><small>Seeded campaign balances + live Sandbox</small></div>
      <div><span>{source === "live" ? "Live Sandbox receipts" : "Demo + Sandbox feed receipts"}</span><strong>{currency.format(model.receiptTotal)}</strong><small>Completed EUR allocations in this feed</small></div>
      <div><span>Largest located funding gap</span><strong>{greatestGap?.name || "No located causes"}</strong><small>{greatestGap ? `${compact.format(greatestGap.remaining)} still needed · ${greatestGap.causes.length} causes` : "Locations have not been supplied"}</small></div>
    </div>

    <div className="impact-map-layout">
      <div className="impact-map-main">
        <div className="impact-map-canvas" ref={canvas}>
          <div className="impact-map-view-switch" role="group" aria-label="Map extent"><button aria-pressed={extent === "active"} onClick={() => resetView("active")}>Active regions</button><button aria-pressed={extent === "world"} onClick={() => resetView("world")}>World</button></div>
          <div className="impact-map-zoom"><button aria-label="Zoom map in" disabled={zoom >= 4} onClick={() => setZoom((value) => Math.min(4, value * 1.4))}><Plus size={17} /></button><button aria-label="Zoom map out" disabled={zoom <= 1} onClick={() => setZoom((value) => Math.max(1, value / 1.4))}><Minus size={17} /></button><button aria-label="Reset map view" onClick={() => resetView()}><ArrowsOutSimple size={17} /></button></div>
          <svg viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`} role="group" aria-label="Cause countries. Select a marker to inspect its funding and contributions." onPointerDown={(event) => {
            if (event.button !== 0 || event.target.closest("[data-map-marker]")) return;
            dragging.current = { x: event.clientX, y: event.clientY, pan }; event.currentTarget.setPointerCapture(event.pointerId); setHoveredId(null);
          }} onPointerMove={(event) => {
            if (!dragging.current) return;
            setPan({ x: dragging.current.pan.x - (event.clientX - dragging.current.x) * screenScale, y: dragging.current.pan.y - (event.clientY - dragging.current.y) * screenScale });
          }} onPointerUp={() => { dragging.current = null; }} onPointerCancel={() => { dragging.current = null; }}>
            <defs><pattern id="impact-map-graticule" width={1000 / 18} height={500 / 18} patternUnits="userSpaceOnUse"><path d={`M${1000 / 18},0H0V${500 / 18}`} fill="none" stroke="#d8e5ed" strokeWidth=".3" /></pattern></defs>
            <rect x="-3000" y="-3000" width="7000" height="7000" fill="url(#impact-map-graticule)" />
            {shapes.map((country) => <path key={country.id} d={country.path} className={`impact-map-land ${activeIds.has(country.id) ? "has-causes" : ""} ${selected?.id === country.id ? "is-selected" : ""}`} vectorEffect="non-scaling-stroke" />)}
            {model.regions.map((region) => {
              const [x, y] = projectPoint(region.coordinates);
              const radius = Math.max(markerMinimum, markerMaximum * Math.sqrt(region.remaining / maxGap)) * screenScale;
              const color = tones[coverageTone(region.coverage)];
              const active = selected?.id === region.id;
              const labelAbove = model.regions.some((other) => {
                if (other.id === region.id) return false;
                const [otherX, otherY] = projectPoint(other.coordinates);
                const otherRadius = Math.max(markerMinimum, markerMaximum * Math.sqrt(other.remaining / maxGap)) * screenScale;
                return Math.hypot(otherX - x, otherY - y) < radius + otherRadius + 20 * screenScale && otherY > y;
              });
              return <g key={region.id} data-map-marker="true" className={`impact-map-marker ${active ? "is-selected" : ""}`} transform={`translate(${x} ${y})`} role="button" tabIndex="0" aria-label={`${region.name}, ${region.causes.length} ${region.causes.length === 1 ? "cause" : "causes"}, ${currency.format(region.remaining)} remaining, ${percent(region.coverage)} funding coverage. View details.`} aria-pressed={active} onClick={() => setSelectedId(region.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedId(region.id); } }} onMouseEnter={() => setHoveredId(region.id)} onMouseLeave={() => setHoveredId(null)} onFocus={() => setHoveredId(region.id)} onBlur={() => setHoveredId(null)}>
                <title>{region.name}: {currency.format(region.remaining)} gap · {percent(region.coverage)} coverage · {percent(region.share)} of selected contributions</title>
                {region.liveReceived > 0 ? <circle className="impact-map-live-halo" r={radius + 5 * screenScale} fill="none" stroke={color} strokeWidth={1.2 * screenScale} /> : null}
                <circle className="impact-map-marker-ring" r={radius + 3 * screenScale} fill="white" opacity={active ? 1 : .72} />
                <circle r={radius} fill={color} stroke="white" strokeWidth={1.5 * screenScale} />
                <circle r={2.4 * screenScale} fill="white" />
                {(size.width >= 500 && extent === "active") || active ? <text y={labelAbove ? -radius - 10 * screenScale : radius + 17 * screenScale} textAnchor="middle" fontSize={12 * screenScale} className="impact-map-label">{region.name}</text> : null}
              </g>;
            })}
          </svg>
          {hovered && tooltipX >= 0 && tooltipX <= 100 && tooltipY >= 0 && tooltipY <= 100 ? <div role="tooltip" className={`impact-map-tooltip ${tooltipX > 55 ? "align-left" : ""}`} style={{ left: `${tooltipX}%`, top: Math.max(12, Math.min(size.height - 300, tooltipY / 100 * size.height + 14)) }}><strong>{hovered.name}</strong><span>{hovered.causes.length} active {hovered.causes.length === 1 ? "cause" : "causes"} · {hovered.fundingKnown ? `${currency.format(hovered.remaining)} remaining gap` : "Funding gap not available"}</span><RegionNumbers region={hovered} source={source} receiptTotal={model.receiptTotal} /><small><HandHeart size={14} /> {hovered.skillNeeds.length ? hovered.skillNeeds.slice(0, 2).map((cause) => cause.skillNeed).join(" · ") + (hovered.skillNeeds.length > 2 ? ` · +${hovered.skillNeeds.length - 2} more` : "") : "No skill needs listed"}</small></div> : null}
          <div className="impact-map-position-note"><MapPin size={13} /> Cause countries, not donor locations</div>
        </div>
        <div className="impact-map-legend"><div><b>Campaign coverage</b><span><i style={{ background: tones.underserved }} /> Under 60%</span><span><i style={{ background: tones.building }} /> 60–79%</span><span><i style={{ background: tones.supported }} /> 80%+</span></div><div><span className="impact-map-size-key"><i /><i /><i /></span><span>Size = remaining funding gap</span></div></div>
        <nav className="impact-map-region-list" aria-label="Select a country">{available.map((region) => <button key={region.id} className={selected?.id === region.id ? "active" : ""} aria-pressed={selected?.id === region.id} onClick={() => setSelectedId(region.id)}><i style={{ background: tones[coverageTone(region.coverage)] }} /><span>{region.coordinates ? region.name : "Unlocated"}</span><strong>{compact.format(region.remaining)} <small>gap</small></strong></button>)}</nav>
      </div>

      {selected ? <aside className="impact-map-detail" aria-label="Selected region details" aria-live="polite">
        <div className="impact-map-detail-heading"><span>{selected.coordinates ? "COUNTRY SPOTLIGHT" : "UNLOCATED DATA"}</span><h3>{selected.name}</h3><p>{selected.causes.length} active {selected.causes.length === 1 ? "cause" : "causes"}{selected.id === greatestGap?.id && selected.remaining > 0 ? " · largest located funding gap" : ""}</p></div>
        <div className="impact-map-gap"><span>Still needed across these causes</span><strong>{selected.fundingKnown ? currency.format(selected.remaining) : "Not available"}</strong><div className="impact-map-coverage-track"><span style={{ width: `${Math.min(100, selected.coverage || 0)}%`, background: tones[coverageTone(selected.coverage)] }} /></div></div>
        <RegionNumbers region={selected} source={source} receiptTotal={model.receiptTotal} />
        <div className="impact-map-integrity"><span><b className="demo-source">DEMO</b> {currency.format(selected.demoFunding)} seeded campaign funding</span><span><b className="live-source">LIVE</b> {currency.format(selected.liveFunding)} Sandbox funding included</span>{source === "all" ? <small>Feed receipts: {currency.format(selected.demoReceived)} demo + {currency.format(selected.liveReceived)} Sandbox. These are separate from campaign balances.</small> : null}</div>
        {selected.missingFunding ? <p className="impact-map-note">Funding values are unavailable for {selected.missingFunding} {selected.missingFunding === 1 ? "cause" : "causes"}; those amounts are excluded from coverage.</p> : null}
        {selected.unmatchedReceipts ? <p className="impact-map-note">{selected.unmatchedReceipts} selected receipts could not be matched to a published cause. Their share remains included in the total.</p> : null}
        <div className="impact-map-causes-heading"><strong>Causes & separate skill needs</strong><HandHeart size={18} /></div>
        <div className="impact-map-causes">{selected.causes.map((cause) => <article key={cause.causeId}><strong>{cause.cause}</strong><span>{cause.location || "No cause location supplied"}</span><small>{cause.remaining === null ? "Funding not available" : `${currency.format(cause.remaining)} funding gap · ${percent(cause.coverage)} coverage`}</small>{cause.skillNeed ? <p><HandHeart size={13} /><span>{cause.skillNeed}{cause.volunteerHoursNeeded > 0 ? ` · ${cause.volunteerHoursNeeded}h requested` : " · hours not listed"}</span></p> : <p>No volunteer need listed.</p>}</article>)}</div>
      </aside> : <aside className="impact-map-detail"><h3>No published causes yet</h3><p>Regions will appear when causes with locations are available.</p></aside>}
    </div>

    <div className="impact-map-method">
      <p>Coverage includes fictional campaign balances plus completed Sandbox funding. Contribution share uses only completed EUR receipts in the selected feed. These percentages measure different things.</p>
      {model.unlocated?.causes.length ? <p className="impact-map-note">{model.unlocated.causes.length} {model.unlocated.causes.length === 1 ? "cause has" : "causes have"} no usable country location. Select “Unlocated” to inspect {model.unlocated.causes.length === 1 ? "it" : "them"}; no location has been guessed.</p> : null}
      {model.excludedCurrency || model.excludedSource ? <p className="impact-map-note">Excluded from receipt totals: {model.excludedCurrency} non-EUR or missing-currency allocations; {model.excludedSource} allocations without a recognized source. No exchange rates are assumed.</p> : null}
      <details><summary>How this map stays honest</summary><p>Causes are joined to their existing location by cause ID, then grouped by country. Markers use Natural Earth country label positions, not exact project coordinates. Marker area scales with each country’s remaining campaign gaps, with a minimum size for visibility. Colors use weighted funding coverage: total campaign funding divided by total goals. Demo feed entries are not added to campaign balances. Unlocated receipts stay in the contribution-share denominator. Skill and volunteer requests remain separate from money.</p></details>
      <span><a href="https://www.naturalearthdata.com/about/terms-of-use/" target="_blank" rel="noreferrer">Made with Natural Earth</a> · Public-domain, locally bundled basemap · Country-level overview</span>
    </div>
  </section>;
}

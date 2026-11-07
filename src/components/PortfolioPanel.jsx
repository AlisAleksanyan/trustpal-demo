import { useMemo, useRef, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  CellStyleModule,
  ClientSideRowModelModule,
  ColumnAutoSizeModule,
  ModuleRegistry,
  NumberEditorModule,
  TextEditorModule,
  ValidationModule,
  themeQuartz,
} from "ag-grid-community";
import { ArrowRight, CheckCircle, Info, Sparkle, Wrench } from "@phosphor-icons/react";
import { allocationReason } from "../impactAgent.js";

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ColumnAutoSizeModule,
  CellStyleModule,
  NumberEditorModule,
  TextEditorModule,
  ValidationModule,
]);

const portfolioTheme = themeQuartz.withParams({
  accentColor: "#0967f2",
  backgroundColor: "#ffffff",
  borderColor: "#e4eaf2",
  borderRadius: 12,
  cellHorizontalPadding: 14,
  fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui",
  fontSize: 13,
  foregroundColor: "#101936",
  headerBackgroundColor: "#f8faff",
  headerFontSize: 12,
  headerFontWeight: 700,
  headerTextColor: "#657089",
  rowHoverColor: "#f8fbff",
  spacing: 7,
  wrapperBorder: false,
});

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

function CauseNameCell({ data }) {
  return (
    <div className="portfolio-cause">
      <img src={data.image} alt="" />
      <div><strong>{data.title}</strong><span>{data.creator}</span></div>
    </div>
  );
}

function ReadinessCell({ data }) {
  return data.recipientReady ? (
    <span className="ready-state"><CheckCircle size={16} weight="fill" /> Ready</span>
  ) : (
    <span className="blocked-state"><Info size={16} weight="fill" /> Onboarding</span>
  );
}

export function PortfolioPanel({ match, onCheckout, onClose, onSkill }) {
  const skillsOnly = match.mode === "skills";
  const [allocations, setAllocations] = useState(() =>
    match.allocations.map((row) => ({ ...row.cause, amount: row.amount, reason: row.reason || allocationReason(row) })),
  );
  const gridRef = useRef(null);

  const columnDefs = useMemo(() => [
    { headerName: "Cause", field: "title", cellRenderer: CauseNameCell, minWidth: 260, flex: 1.45 },
    { headerName: "Needs now", field: "skillNeed", minWidth: 175, flex: 1 },
    { headerName: "Why it matched", field: "reason", minWidth: 230, flex: 1.25, wrapText: true },
    ...(skillsOnly ? [{
      headerName: "Contribute", minWidth: 165,
      cellRenderer: ({ data }) => <button className="secondary-button compact" onClick={() => onSkill(data)}>Offer a skill</button>,
    }] : [
    { headerName: "PayPal recipient", field: "recipientReady", cellRenderer: ReadinessCell, minWidth: 145 },
    {
      headerName: "Amount",
      field: "amount",
      editable: true,
      minWidth: 125,
      maxWidth: 150,
      valueParser: ({ newValue, oldValue }) => {
        const value = Number(newValue);
        return Number.isFinite(value) && value >= 0 ? Number(value.toFixed(2)) : oldValue;
      },
      valueFormatter: ({ value }) => euro.format(value),
      cellClass: "editable-amount",
    },
    ]),
  ], [skillsOnly, onSkill]);

  const total = allocations.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const balanced = Math.abs(total - match.total) < 0.01;

  const rebalance = () => {
    setAllocations(match.allocations.map((row) => ({ ...row.cause, amount: row.amount, reason: row.reason || allocationReason(row) })));
  };

  return (
    <section className="portfolio-panel" aria-labelledby="portfolio-title">
      <div className="portfolio-heading">
        <div>
          <span className={match.source === "model" ? "eyebrow ai-live" : "eyebrow ai-fallback"}>
            <Sparkle size={17} weight="fill" /> {match.source === "model" ? `Live AI · ${match.modelLabel}` : "Transparent rules fallback"}
          </span>
          <h2 id="portfolio-title">{skillsOnly ? "Your skill matches" : "Your editable giving plan"}</h2>
          <p>{match.summary}</p>
          {match.fallbackReason ? <small className="fallback-reason">{match.fallbackReason}</small> : null}
        </div>
        <button className="icon-close" onClick={onClose} aria-label="Close giving plan">×</button>
      </div>

      <div className="agent-trace" aria-label="Agent steps">
        {match.toolTrace.map((step, index) => (
          <div key={step.label} className="trace-step">
            <span>{index + 1}</span>
            <div><strong>{step.label}</strong><small>{step.detail}</small></div>
          </div>
        ))}
      </div>

      <div className="portfolio-grid">
        <AgGridReact
          ref={gridRef}
          theme={portfolioTheme}
          rowData={allocations}
          columnDefs={columnDefs}
          rowHeight={76}
          headerHeight={42}
          domLayout="autoHeight"
          stopEditingWhenCellsLoseFocus={true}
          singleClickEdit={true}
          onCellValueChanged={({ data }) => {
            setAllocations((current) => current.map((row) => row.id === data.id ? { ...data } : row));
          }}
          getRowId={({ data }) => data.id}
        />
      </div>

      {skillsOnly ? <p className="skills-only-note">Money is optional. Verified time and skills earn permanent Trust Points too.</p> : <div className="portfolio-footer">
        <div className="allocation-note">
          <Wrench size={20} />
          <div><strong>Amounts are editable in the grid</strong><span>Double-click an amount, type a new value, then press Enter.</span></div>
        </div>
        <button className="text-link" onClick={rebalance}>Restore AI split</button>
        <div className={balanced ? "portfolio-total" : "portfolio-total invalid"}>
          <span>Plan total</span><strong>{euro.format(total)}</strong>
          <small>{balanced ? "Matches your budget" : `${euro.format(match.total - total)} remaining`}</small>
        </div>
        <button
          className="primary-button checkout-button"
          disabled={!balanced || total <= 0 || allocations.some((row) => !row.recipientReady)}
          onClick={() => onCheckout(allocations)}
        >
          Review {euro.format(total)} with PayPal <ArrowRight size={19} weight="bold" />
        </button>
      </div>}
    </section>
  );
}


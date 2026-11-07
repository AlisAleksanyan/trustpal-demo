import { useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import {
  CellStyleModule,
  ClientSideRowModelModule,
  ColumnAutoSizeModule,
  DateFilterModule,
  ModuleRegistry,
  NumberFilterModule,
  TextFilterModule,
  ValidationModule,
  themeQuartz,
} from "ag-grid-community";
import {
  ArrowClockwise,
  CheckCircle,
  Clock,
  Database,
  HandHeart,
  Lightning,
  MagicWand,
  PaypalLogo,
  ShieldCheck,
  Sparkle,
  TrendUp,
  UsersThree,
  WarningCircle,
} from "@phosphor-icons/react";
import { requestDashboardInsight } from "../aiClient.js";
import { GlobalImpactMap } from "./GlobalImpactMap.jsx";

ModuleRegistry.registerModules([
  ClientSideRowModelModule,
  ColumnAutoSizeModule,
  CellStyleModule,
  TextFilterModule,
  NumberFilterModule,
  DateFilterModule,
  ValidationModule,
]);

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

const commandTheme = themeQuartz.withParams({
  accentColor: "#0866f5",
  backgroundColor: "#ffffff",
  borderColor: "#e5ebf3",
  borderRadius: 12,
  browserColorScheme: "light",
  cellHorizontalPadding: 16,
  fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui",
  fontSize: 13,
  foregroundColor: "#101936",
  headerBackgroundColor: "#f7f9fc",
  headerFontSize: 12,
  headerFontWeight: 700,
  headerTextColor: "#647089",
  oddRowBackgroundColor: "#ffffff",
  rowBorder: true,
  rowHoverColor: "#f5f9ff",
  spacing: 8,
  wrapperBorder: false,
});

function PaymentStatus({ data }) {
  const verified = data.webhookVerified;
  return (
    <div className="command-status-cell">
      <span className={data.live ? "live-source" : "demo-source"}>{data.live ? "LIVE" : "DEMO"}</span>
      <span className={verified ? "verified-state" : "pending-state"}>
        {verified ? <CheckCircle size={14} weight="fill" /> : <Clock size={14} />}
        {verified ? "Webhook verified" : "Capture confirmed"}
      </span>
    </div>
  );
}

function CampaignProgress({ data }) {
  return (
    <div className="command-progress-cell">
      <div><strong>{data.fundingPercent}%</strong><span>{euro.format(data.raised)} of {euro.format(data.goal)}</span></div>
      <div className="progress-track"><span style={{ width: `${data.fundingPercent}%` }} /></div>
    </div>
  );
}

function CauseName({ data }) {
  return <div className="command-cause-cell"><strong>{data.cause}</strong><span>{data.creator} · {data.creatorType}</span></div>;
}

function EmptyCommandState({ error, onRetry }) {
  return (
    <main className="page-shell command-center-page">
      <section className="command-empty">
        <WarningCircle size={46} weight="duotone" />
        <h1>Impact data is unavailable</h1>
        <p>{error || "TrustPal could not load the demo impact read model."}</p>
        <button className="primary-button" onClick={onRetry}><ArrowClockwise size={18} /> Try again</button>
      </section>
    </main>
  );
}

export function ImpactCommandCenter() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTable, setActiveTable] = useState("donations");
  const [question, setQuestion] = useState("Where would €100 or four volunteer hours close the most urgent gap?");
  const [insight, setInsight] = useState(null);
  const [asking, setAsking] = useState(false);
  const [aiError, setAiError] = useState("");

  const loadDashboard = async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/impact-api/dashboard", { headers: { Accept: "application/json" } });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || "Impact data request failed.");
      setDashboard(data);
      setError("");
    } catch (loadError) {
      setError(loadError.message || "Impact data request failed.");
    } finally {
      if (!quiet) setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") loadDashboard({ quiet: true });
    }, 5_000);
    return () => window.clearInterval(interval);
  }, []);

  const donationColumns = useMemo(() => [
    { headerName: "Time", field: "occurredAt", width: 88, valueFormatter: ({ value }) => time.format(new Date(value)), sort: "desc" },
    { headerName: "Contributor", field: "donorAlias", minWidth: 170, flex: .8 },
    { headerName: "Cause", field: "cause", minWidth: 290, flex: 1.4 },
    { headerName: "PayPal capture", field: "captureReference", minWidth: 145, flex: .65 },
    { headerName: "Amount", field: "amount", width: 110, valueFormatter: ({ value }) => euro.format(value), cellClass: "money-column" },
    { headerName: "Integrity", cellRenderer: PaymentStatus, minWidth: 230, flex: 1 },
  ], []);

  const campaignColumns = useMemo(() => [
    { headerName: "Cause", field: "cause", cellRenderer: CauseName, minWidth: 340, flex: 1.35 },
    { headerName: "Campaign progress", field: "fundingPercent", cellRenderer: CampaignProgress, minWidth: 280, flex: 1.1, sort: "asc" },
    { headerName: "Funding gap", field: "remaining", width: 130, valueFormatter: ({ value }) => euro.format(value), cellClass: "money-column" },
    { headerName: "Skills needed", field: "skillNeed", minWidth: 220, flex: .9 },
    { headerName: "Deadline", field: "deadlineDays", width: 115, valueFormatter: ({ value }) => `${value} days` },
  ], []);

  const contributorColumns = useMemo(() => [
    { headerName: "Impact contributor", field: "contributor", minWidth: 220, flex: 1.1 },
    { headerName: "Skills points", field: "skillPoints", width: 140, sort: "desc" },
    { headerName: "Giving points", field: "moneyPoints", width: 140 },
    { headerName: "Total verified", field: "totalPoints", width: 145, cellClass: "points-column" },
    { headerName: "Verified actions", field: "verifiedContributions", width: 150 },
    { headerName: "Causes helped", field: "causesSupported", width: 135 },
    { headerName: "Creator access", field: "creatorUnlocked", minWidth: 150, valueFormatter: ({ value }) => value ? "Unlocked" : "In progress" },
  ], []);

  const activeGrid = activeTable === "campaigns"
    ? { rows: dashboard?.campaigns || [], columns: campaignColumns, rowHeight: 76 }
    : activeTable === "contributors"
      ? { rows: dashboard?.contributors || [], columns: contributorColumns, rowHeight: 58 }
      : { rows: dashboard?.donations || [], columns: donationColumns, rowHeight: 64 };

  const askAgent = async (prompt = question) => {
    const nextPrompt = String(prompt || "").trim();
    if (nextPrompt.length < 3 || asking) return;
    setQuestion(nextPrompt);
    setAsking(true);
    setAiError("");
    try {
      setInsight(await requestDashboardInsight(nextPrompt));
    } catch (requestError) {
      setAiError(requestError.message || "The impact agent could not answer.");
    } finally {
      setAsking(false);
    }
  };

  if (loading && !dashboard) return <main className="page-shell command-center-page"><div className="loading-panel">Loading the live impact read model…</div></main>;
  if (!dashboard) return <EmptyCommandState error={error} onRetry={() => loadDashboard()} />;

  const { summary } = dashboard;
  const latestLive = dashboard.donations.find((donation) => donation.live);
  return (
    <main className="page-shell command-center-page">
      <section className="command-hero">
        <div>
          <span className="eyebrow"><Lightning size={16} weight="fill" /> TrustPal Live Impact Command Center</span>
          <h1>See every contribution become impact.</h1>
          <p>PayPal Sandbox captures, campaign gaps, and verified skills in one inspectable AG-powered decision surface.</p>
        </div>
        <div className="command-live-card">
          <span className="live-dot" />
          <div><strong>{latestLive ? "Live Sandbox capture received" : "Listening for a live capture"}</strong><span>{latestLive ? `${euro.format(latestLive.amount)} · ${latestLive.cause}` : "Complete a PayPal checkout to update this dashboard."}</span></div>
          <button onClick={() => loadDashboard()} aria-label="Refresh live impact data"><ArrowClockwise size={19} /></button>
        </div>
      </section>

      <section className="command-disclosure">
        <ShieldCheck size={20} weight="fill" />
        <p><strong>Transparent hackathon data:</strong> rows marked DEMO are fictional history. Rows marked LIVE come from PayPal Sandbox captures. No real money, production credentials, or real donor data are used.</p>
      </section>

      <section className="command-kpis" aria-label="Impact summary">
        <article><span><PaypalLogo size={20} weight="fill" /> Sandbox giving</span><strong>{euro.format(summary.liveSandboxGiving)}</strong><small>Completed during this running demo</small></article>
        <article><span><TrendUp size={20} /> Tracked giving</span><strong>{euro.format(summary.totalGiving)}</strong><small>Demo history plus live Sandbox</small></article>
        <article><span><HandHeart size={20} /> Verified skill time</span><strong>{summary.verifiedSkillHours}h</strong><small>Fictional demonstration records</small></article>
        <article><span><UsersThree size={20} /> Active causes</span><strong>{summary.activeCampaigns}</strong><small>{summary.openSkillNeeds} open skill categories</small></article>
      </section>

      <section className="command-ai-panel">
        <div className="command-ai-heading">
          <span className="ai-orb"><Sparkle size={22} weight="fill" /></span>
          <div><span className="eyebrow">Live AI · read-only analyst</span><h2>Ask where help closes the biggest gap</h2></div>
        </div>
        <div className="command-ai-input">
          <input value={question} maxLength={400} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => event.key === "Enter" && askAgent()} aria-label="Ask the impact analyst" />
          <button className="primary-button" onClick={() => askAgent()} disabled={asking}><MagicWand size={18} weight="fill" /> {asking ? "Analyzing…" : "Analyze live data"}</button>
        </div>
        <div className="command-prompts">
          {["Show education causes below 70% funded", "Where can four volunteer hours help most?", "Which urgent cause has the smallest funding gap?"].map((prompt) => <button key={prompt} onClick={() => askAgent(prompt)}>{prompt}</button>)}
        </div>
        {aiError ? <p className="inline-error" role="alert">{aiError}</p> : null}
        {insight ? (
          <div className="command-insight">
            <div><Sparkle size={18} weight="fill" /><strong>{insight.headline}</strong></div>
            <p>{insight.explanation}</p>
            <span><b>Suggested action:</b> {insight.suggestedAction}</span>
            <small>{insight.caveat} · AI cannot move money, verify work, or issue Trust Points.</small>
          </div>
        ) : null}
      </section>

      <section className="command-grid-section">
        <div className="command-section-heading">
          <div><span className="eyebrow"><Database size={15} /> AG Grid decision surface</span><h2>Live impact evidence</h2></div>
          <div className="command-table-tabs" role="tablist" aria-label="Impact tables">
            <button className={activeTable === "donations" ? "active" : ""} onClick={() => setActiveTable("donations")}>PayPal feed</button>
            <button className={activeTable === "campaigns" ? "active" : ""} onClick={() => setActiveTable("campaigns")}>Campaigns</button>
            <button className={activeTable === "contributors" ? "active" : ""} onClick={() => setActiveTable("contributors")}>Impact leaderboard</button>
          </div>
        </div>
        <div className="command-grid">
          <AgGridReact
            theme={commandTheme}
            rowData={activeGrid.rows}
            columnDefs={activeGrid.columns}
            rowHeight={activeGrid.rowHeight}
            headerHeight={42}
            domLayout="autoHeight"
            animateRows
            defaultColDef={{ sortable: true, filter: true, resizable: true }}
            getRowId={({ data }) => data.eventId || data.causeId || data.contributor}
          />
        </div>
      </section>

      <GlobalImpactMap dashboard={dashboard} />
    </main>
  );
}

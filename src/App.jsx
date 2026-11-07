import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ArrowRight, HandHeart, NumberCircleOne, NumberCircleThree, NumberCircleTwo, ShieldCheck, UsersThree } from "@phosphor-icons/react";
import { Header } from "./components/Header.jsx";
import { ImpactMatch } from "./components/ImpactMatch.jsx";
import { DirectDonateDialog, PayPalDialog, SkillDialog } from "./components/Dialogs.jsx";
import { causes as seedCauses, featuredCauseIds, profile as seedProfile } from "./data.js";
import { PAYPAL_PENDING_KEY, clearPayPalReturnParams, clearPendingCheckout, readPayPalReturnAction, readPayPalReturnOrderId, readPendingCheckout } from "./paypalState.js";
import { requestImpactMatch } from "./aiClient.js";
import { APP_STATE_KEY, createUserCause, loadAppState, saveAppState } from "./storage.js";

const filters = ["All", "Money", "Skills", "NGOs", "Creator causes"];
const CauseGrid = lazy(() => import("./components/CauseGrid.jsx").then((module) => ({ default: module.CauseGrid })));
const ViewAllButton = lazy(() => import("./components/CauseGrid.jsx").then((module) => ({ default: module.ViewAllButton })));
const PortfolioPanel = lazy(() => import("./components/PortfolioPanel.jsx").then((module) => ({ default: module.PortfolioPanel })));
const ImpactPage = lazy(() => import("./components/ImpactPage.jsx").then((module) => ({ default: module.ImpactPage })));
const CauseBuilder = lazy(() => import("./components/CauseBuilder.jsx").then((module) => ({ default: module.CauseBuilder })));
const ImpactCommandCenter = lazy(() => import("./components/ImpactCommandCenter.jsx").then((module) => ({ default: module.ImpactCommandCenter })));
const StewardConsole = lazy(() => import("./components/StewardConsole.jsx").then((module) => ({ default: module.StewardConsole })));

function LoadingPanel({ label = "Loading…" }) {
  return <div className="loading-panel" role="status">{label}</div>;
}

function initialAppState() {
  const url = new URL(window.location.href);
  if (url.searchParams.get("resetDemo") === "1") {
    localStorage.removeItem(APP_STATE_KEY);
    sessionStorage.removeItem(PAYPAL_PENDING_KEY);
    url.searchParams.delete("resetDemo");
    history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }
  return loadAppState(seedProfile, seedCauses);
}

function HowItWorks() {
  const steps = [
    [NumberCircleOne, HandHeart, "Contribute", "Give money, time, or skills."],
    [NumberCircleTwo, ShieldCheck, "Earn Trust Points", "An approved steward verifies your impact."],
    [NumberCircleThree, UsersThree, "Unlock Creator Level", "Start a cause of your own."],
  ];
  return (
    <section id="how-it-works" className="how-it-works" aria-label="How TrustPal works">
      {steps.map(([NumberIcon, Icon, title, text], index) => (
        <div className="how-step" key={title}>
          <NumberIcon className="step-number" size={34} weight="fill" />
          <Icon className="step-icon" size={31} weight="duotone" />
          <div><strong>{title}</strong><span>{text}</span></div>
          {index < steps.length - 1 ? <ArrowRight className="step-arrow" size={24} /> : null}
        </div>
      ))}
    </section>
  );
}

function DiscoverPage({ causes, onSandboxCapture, onOpenCommandCenter }) {
  const [activeFilter, setActiveFilter] = useState("All");
  const [expanded, setExpanded] = useState(false);
  const [match, setMatch] = useState(null);
  const [matchVersion, setMatchVersion] = useState(0);
  const [dialog, setDialog] = useState(null);

  useEffect(() => {
    const pending = readPendingCheckout();
    if (!pending) {
      if (readPayPalReturnOrderId() || readPayPalReturnAction()) clearPayPalReturnParams();
      return;
    }
    const byId = new Map(causes.map((cause) => [cause.id, cause]));
    const restored = pending.allocations
      .map(({ id, amount }) => byId.has(id) ? { ...byId.get(id), amount: Number(amount) } : null)
      .filter(Boolean);
    if (restored.length === pending.allocations.length) {
      setDialog({ type: "paypal", allocations: restored });
    } else {
      clearPayPalReturnParams();
      clearPendingCheckout();
    }
  }, [causes]);

  const filtered = useMemo(() => {
    let rows = causes;
    if (activeFilter === "NGOs") rows = causes.filter((cause) => cause.creatorType === "ngo");
    if (activeFilter === "Creator causes") rows = causes.filter((cause) => cause.creatorType === "creator");
    if (activeFilter === "Skills") rows = causes.filter((cause) => Boolean(cause.skillNeed));
    if (activeFilter === "Money") rows = causes.filter((cause) => cause.recipientReady);
    if (!expanded) {
      const featured = new Set(featuredCauseIds);
      rows = rows.filter((cause) => featured.has(cause.id)).slice(0, 3);
    }
    return rows;
  }, [activeFilter, causes, expanded]);

  const runMatch = async (input) => {
    const result = await requestImpactMatch({ causes, ...input });
    setMatch(result);
    setMatchVersion((current) => current + 1);
    window.setTimeout(() => document.getElementById("giving-plan")?.scrollIntoView({ behavior: "smooth", block: "start" }), 30);
  };

  return (
    <main>
      <section className="landing-shell">
        <div className="landing-title">
          <h1>Good deeds should count.</h1>
          <p>Contribute money or skills, earn verified Trust Points, and unlock your own cause to make an impact.</p>
        </div>
        <ImpactMatch onMatch={runMatch} />
        <HowItWorks />
      </section>

      {match ? <div id="giving-plan" className="portfolio-wrap"><Suspense fallback={<LoadingPanel label="Preparing your giving plan…" />}><PortfolioPanel key={matchVersion} match={match} onClose={() => setMatch(null)} onSkill={(cause) => setDialog({ type: "skill", cause })} onCheckout={(allocations) => setDialog({ type: "paypal", allocations })} /></Suspense></div> : null}

      <section className="causes-section">
        <div className="cause-section-heading">
          <div><span className="eyebrow">Live, verified needs</span><h2>{causes.length} causes looking for support</h2></div>
          <div className="cause-filters" role="group" aria-label="Filter causes">
            {filters.map((filter) => <button key={filter} className={activeFilter === filter ? "selected" : ""} onClick={() => setActiveFilter(filter)}>{filter}</button>)}
          </div>
        </div>
        <Suspense fallback={<LoadingPanel label="Loading verified causes…" />}>
          <CauseGrid rows={filtered} onDonate={(cause) => setDialog({ type: "donate", cause })} onSkill={(cause) => setDialog({ type: "skill", cause })} />
          <ViewAllButton expanded={expanded} total={causes.length} onClick={() => setExpanded((value) => !value)} />
        </Suspense>
      </section>

      <section className="judge-proof">
        <div><span className="eyebrow">Why this is different</span><h2>Money moves through PayPal. Impact stays visible.</h2></div>
        <div className="judge-proof-action"><p>AI recommends; people decide. Approved stewards verify contributions. AG Grid keeps funding, skill gaps, allocations, and payment outcomes inspectable in one decision surface.</p><button className="secondary-button" onClick={onOpenCommandCenter}>View live impact <ArrowRight size={18} weight="bold" /></button></div>
      </section>

      {dialog?.type === "donate" ? <DirectDonateDialog cause={dialog.cause} onClose={() => setDialog(null)} onReview={(allocations) => setDialog({ type: "paypal", allocations })} /> : null}
      {dialog?.type === "skill" ? <SkillDialog cause={dialog.cause} onClose={() => setDialog(null)} /> : null}
      {dialog?.type === "paypal" ? <PayPalDialog allocations={dialog.allocations} onClose={() => { clearPendingCheckout(); setDialog(null); }} onComplete={onSandboxCapture} onViewImpact={onOpenCommandCenter} /> : null}
    </main>
  );
}

export function App() {
  const [initialState] = useState(initialAppState);
  const [view, setView] = useState("discover");
  const [profile] = useState(initialState.profile);
  const [causes, setCauses] = useState(initialState.causes);

  useEffect(() => {
    saveAppState(profile, causes);
  }, [profile, causes]);

  const navigate = (next) => {
    setView(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const recordSandboxCapture = () => {
    // The server appends completed Sandbox captures to a separate analytics
    // read model. Anonymous visitors still cannot modify canonical cause totals,
    // Trust Points, or protected impact records.
  };

  const publishCause = (draft, structuredDraft) => {
    const cause = createUserCause(draft, structuredDraft, profile);
    setCauses((current) => current.some((item) => item.id === cause.id) ? current : [cause, ...current]);
    return cause;
  };

  return (
    <div className="app">
      <Header view={view} onNavigate={navigate} />
      {view === "discover" ? <DiscoverPage causes={causes} onSandboxCapture={recordSandboxCapture} onOpenCommandCenter={() => navigate("command")} /> : null}
      <Suspense fallback={<LoadingPanel label="Loading page…" />}>
        {view === "command" ? <ImpactCommandCenter /> : null}
        {view === "steward" ? <StewardConsole /> : null}
        {view === "impact" ? <ImpactPage profile={profile} onCreate={() => navigate("create")} /> : null}
        {view === "create" ? <CauseBuilder profile={profile} onBack={() => navigate("discover")} onPublish={publishCause} /> : null}
      </Suspense>
      <footer className="app-footer"><span><strong>TrustPal</strong> hackathon prototype</span><span>PayPal Sandbox · Astropods AI · AG Grid · Fictional causes and recipients</span></footer>
    </div>
  );
}

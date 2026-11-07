import { useState } from "react";
import { ArrowRight, CheckCircle, CurrencyEur, ListChecks, Sparkle, UsersThree } from "@phosphor-icons/react";
import { requestCauseDraft } from "../aiClient.js";

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export function CauseBuilder({ profile, onPublish, onBack }) {
  const [draft, setDraft] = useState({
    title: "Help me complete my Data Science degree",
    story: "I need support for next year’s tuition and a mentor who can help me prepare for my first data role.",
    goal: 5000,
    skillNeed: "Career mentor",
  });
  const [structuredDraft, setStructuredDraft] = useState(null);
  const [structuring, setStructuring] = useState(false);
  const [error, setError] = useState("");
  const [published, setPublished] = useState(false);

  const structureCause = async () => {
    if (!draft.title.trim() || !draft.story.trim() || draft.goal < 50 || !draft.skillNeed.trim()) {
      setError("Add a clear title, story, goal of at least €50, and skill need.");
      return;
    }
    setStructuring(true);
    setError("");
    try {
      setStructuredDraft(await requestCauseDraft(draft));
    } catch (structureError) {
      setError(structureError.message || "The cause draft could not be structured.");
    } finally {
      setStructuring(false);
    }
  };

  if (published) {
    return (
      <main className="page-shell centered-state">
        <CheckCircle size={64} weight="fill" />
        <h1>Your cause is ready for review</h1>
        <p>You chose the purpose. AI structured the draft. Human review checks evidence, classification, and PayPal recipient readiness without replacing your idea.</p>
        <button className="primary-button" onClick={onBack}>Return to Discover <ArrowRight size={18} /></button>
      </main>
    );
  }

  return (
    <main className="page-shell builder-page">
      <section className="builder-heading">
        <div><span className="eyebrow"><CheckCircle size={17} weight="fill" /> Creator Level · {profile.points.toLocaleString()} Trust Points</span><h1>Start a cause of your own.</h1><p>Your contribution history unlocked this. You choose what to build; AI helps make the plan clear and reviewable.</p></div>
        <div className="points-not-spent"><strong>{profile.points.toLocaleString()}</strong><span>Your points stay permanent after publishing.</span></div>
      </section>
      <div className="builder-layout">
        <section className="builder-form">
          <h2>Your idea</h2>
          <label className="field-label" htmlFor="cause-title">Cause title</label>
          <input className="text-input" id="cause-title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={180} />
          <label className="field-label" htmlFor="cause-story">What do you want to make possible?</label>
          <textarea className="text-area tall" id="cause-story" value={draft.story} onChange={(e) => setDraft({ ...draft, story: e.target.value })} maxLength={1200} />
          <div className="split-fields"><label><span className="field-label">Funding goal</span><div className="money-input"><span>€</span><input type="number" min="50" max="100000" value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: Number(e.target.value) })} /></div></label><label><span className="field-label">Skill support needed</span><input className="text-input" value={draft.skillNeed} onChange={(e) => setDraft({ ...draft, skillNeed: e.target.value })} maxLength={180} /></label></div>
          <p className="privacy-note">Public demo: use fictional details only. Do not enter personal or sensitive information.</p>
          <button className="primary-button full-width" onClick={structureCause} disabled={structuring}>
            <Sparkle size={19} weight="fill" /> {structuring ? "Structuring with AI…" : "Structure my cause with AI"}
          </button>
          {error ? <p className="inline-error" role="alert">{error}</p> : null}
        </section>
        <aside className={structuredDraft ? "ai-draft ready" : "ai-draft"}>
          <span className={structuredDraft?.source === "model" ? "eyebrow ai-live" : structuredDraft ? "eyebrow ai-fallback" : "eyebrow"}><Sparkle size={16} weight="fill" /> {structuredDraft?.source === "model" ? `Live AI · ${structuredDraft.model}` : structuredDraft ? "Transparent rules fallback" : "AI Cause Builder"}</span>
          {structuredDraft ? (
            <>
              <h2>Review the structured plan</h2>
              {structuredDraft.fallbackReason ? <p className="fallback-reason">{structuredDraft.fallbackReason} Edit your inputs and run the builder again to revise this draft.</p> : null}
              <div className="draft-block"><ListChecks size={21} /><div><strong>Milestones</strong><span>{structuredDraft.milestones.join(" · ")}</span></div></div>
              <div className="draft-block"><CurrencyEur size={21} /><div><strong>Budget</strong><span>{structuredDraft.budget.map((item) => `${item.label} ${euro.format(item.amount)}`).join(" · ")}</span></div></div>
              <div className="draft-block"><UsersThree size={21} /><div><strong>Non-money need</strong><span>{draft.skillNeed} · Creator-selected support</span></div></div>
              <div className="classification-note"><CheckCircle size={20} /><span><strong>{structuredDraft.supportType}</strong>{structuredDraft.category} · Donation only. No equity, repayment, or financial return.</span></div>
              <button className="primary-button full-width" onClick={() => { onPublish?.(draft, structuredDraft); setPublished(true); }}>Submit my cause for review</button>
            </>
          ) : (
            <div className="empty-draft"><Sparkle size={38} /><h3>Your structured plan will appear here</h3><p>AI will turn your idea into milestones, a budget, an evidence checklist, and skill needs. You approve every detail.</p></div>
          )}
        </aside>
      </div>
    </main>
  );
}


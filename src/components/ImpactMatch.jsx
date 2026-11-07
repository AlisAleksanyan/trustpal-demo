import { useState } from "react";
import { ArrowRight, CurrencyEur, Sparkle, UsersThree } from "@phosphor-icons/react";

export function ImpactMatch({ onMatch }) {
  const [mode, setMode] = useState("both");
  const [prompt, setPrompt] = useState("I can give €80 and teach English online for 2 hours");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (event) => {
    event.preventDefault();
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    try {
      await onMatch({ prompt, mode });
    } catch (matchError) {
      setError(matchError.message || "TrustPal could not build a match right now.");
    } finally {
      setLoading(false);
    }
  };

  const modes = [
    ["money", CurrencyEur, "Money"],
    ["skills", UsersThree, "Skills"],
    ["both", UsersThree, "Both"],
  ];

  return (
    <section className="ai-match" aria-labelledby="ai-match-title">
      <div className="ai-match-intro">
        <Sparkle size={30} weight="fill" aria-hidden="true" />
        <div>
          <h2 id="ai-match-title">AI Impact Match</h2>
          <p>Tell us what you can give. We’ll find causes that need your support.</p>
        </div>
      </div>
      <form className="ai-composer" onSubmit={submit}>
        <div className="mode-tabs" aria-label="Contribution type">
          {modes.map(([id, Icon, label]) => (
            <button
              type="button"
              key={id}
              className={mode === id ? "mode-chip selected" : "mode-chip"}
              onClick={() => setMode(id)}
              aria-pressed={mode === id}
            >
              <Icon size={17} weight="bold" /> {label}
            </button>
          ))}
        </div>
        <div className="prompt-row">
          <label className="sr-only" htmlFor="impact-prompt">Describe what you can contribute</label>
          <input
            id="impact-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            maxLength={600}
            placeholder="I can give €50 and volunteer for 2 hours"
          />
          <button className="primary-button match-button" disabled={loading}>
            {loading ? "Comparing causes with AI…" : "Find my matches"}
            {loading ? null : <ArrowRight size={20} weight="bold" />}
          </button>
        </div>
        <div className="ai-helper">
          <span>AI compares urgency, funding gaps, and skill needs. You choose what to support.</span>
          <button type="button" className="text-link" onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}>
            See how AI decides
          </button>
          <span className="paypal-note">Money is sent securely with PayPal.</span>
        </div>
        <p className="privacy-note">Public demo: do not enter personal or sensitive information.</p>
        {error ? <p className="inline-error" role="alert">{error}</p> : null}
      </form>
    </section>
  );
}


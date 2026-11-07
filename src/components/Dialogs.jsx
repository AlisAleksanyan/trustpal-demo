import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  FileText,
  LockKey,
  ShieldCheck,
  Sparkle,
  X,
} from "@phosphor-icons/react";
import { loadPayPalSdk } from "../paypalSdk.js";
import {
  clearPayPalReturnParams,
  clearPendingCheckout,
  readPayPalReturnAction,
  readPayPalReturnOrderId,
  readPendingCheckout,
  savePendingCheckout,
} from "../paypalState.js";
import { requestSkillEvidence } from "../aiClient.js";

const euro = new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" });

function DialogShell({ title, eyebrow, onClose, children, wide = false }) {
  useEffect(() => {
    const onKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={wide ? "dialog dialog-wide" : "dialog"} role="dialog" aria-modal="true" aria-labelledby="dialog-title">
        <div className="dialog-header">
          <div><span className="eyebrow">{eyebrow}</span><h2 id="dialog-title">{title}</h2></div>
          <button className="icon-close" onClick={onClose} aria-label="Close dialog"><X size={20} /></button>
        </div>
        {children}
      </section>
    </div>
  );
}

export function DirectDonateDialog({ cause, onClose, onReview }) {
  const [amount, setAmount] = useState(25);
  return (
    <DialogShell title={`Support ${cause.title}`} eyebrow={cause.supportType} onClose={onClose}>
      <div className="dialog-cause-summary">
        <img src={cause.image} alt="" />
        <div><strong>{cause.creator}</strong><span>{cause.recipientReady ? "PayPal recipient ready" : "Recipient onboarding incomplete"}</span></div>
      </div>
      <label className="field-label" htmlFor="donation-amount">Donation amount</label>
      <div className="money-input"><span>€</span><input id="donation-amount" type="number" min="1" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>
      <div className="amount-chips">
        {[10, 25, 50, 100].map((value) => <button key={value} className={amount === value ? "selected" : ""} onClick={() => setAmount(value)}>€{value}</button>)}
      </div>
      <div className="classification-note"><ShieldCheck size={20} /><span><strong>{cause.supportType}</strong>This classification and the PayPal recipient are shown again before approval.</span></div>
      <button className="primary-button full-width" onClick={() => onReview([{ ...cause, amount }])} disabled={!amount || amount < 1 || !cause.recipientReady}>
        Review with PayPal <ArrowRight size={19} weight="bold" />
      </button>
    </DialogShell>
  );
}

export function SkillDialog({ cause, onClose }) {
  const [step, setStep] = useState("offer");
  const [hours, setHours] = useState(cause.skillHours || 2);
  const [note, setNote] = useState(`I can help with ${cause.skillNeed.toLowerCase()} and provide evidence after the session.`);
  const [structured, setStructured] = useState(null);
  const [structuring, setStructuring] = useState(false);
  const [error, setError] = useState("");
  const points = hours * (cause.skillCategory === "Teaching" ? 50 : 40);

  const structureOffer = async () => {
    if (!note.trim() || hours < 1 || hours > 20) {
      setError("Describe your offer and choose between 1 and 20 hours.");
      return;
    }
    setStructuring(true);
    setError("");
    try {
      const result = await requestSkillEvidence({
        causeId: cause.id,
        hours,
        note,
      });
      setStructured(result);
      setStep("structured");
    } catch (structureError) {
      setError(structureError.message || "The evidence plan could not be structured.");
    } finally {
      setStructuring(false);
    }
  };

  const submitForReview = async () => {
    setStructuring(true); setError("");
    try {
      const response = await fetch("/steward-api/offers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ causeId: cause.id, hours, note }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Your offer could not be submitted.");
      setStep("submitted");
    } catch (e) { setError(e.message); } finally { setStructuring(false); }
  };

  return (
    <DialogShell title={step === "submitted" ? "Offer submitted" : `Offer your skills`} eyebrow={cause.title} onClose={onClose}>
      {step === "offer" ? (
        <>
          <div className="skill-request"><strong>{cause.skillNeed}</strong><span>{cause.location}</span></div>
          <label className="field-label" htmlFor="skill-hours">Hours you can contribute</label>
          <input className="text-input" id="skill-hours" type="number" min="1" max="20" value={hours} onChange={(event) => setHours(Number(event.target.value))} />
          <label className="field-label" htmlFor="skill-note">How can you help?</label>
          <textarea className="text-area" id="skill-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={600} />
          <p className="privacy-note">Public demo: do not include names, contact details, or other sensitive information.</p>
          <button className="primary-button full-width" onClick={structureOffer} disabled={structuring}><Sparkle size={19} weight="fill" /> {structuring ? "Structuring evidence…" : "Let AI structure my offer"}</button>
          {error ? <p className="inline-error" role="alert">{error}</p> : null}
        </>
      ) : null}
      {step === "structured" ? (
        <>
          <div className="agent-result">
            <span className={structured?.source === "model" ? "eyebrow ai-live" : "eyebrow ai-fallback"}><Sparkle size={16} weight="fill" /> {structured?.source === "model" ? `Live AI · ${structured.model}` : "Transparent rules fallback"}</span>
            {structured?.fallbackReason ? <p className="fallback-reason">{structured.fallbackReason}</p> : null}
            <dl>
              <div><dt>Contribution</dt><dd>{structured.contribution}</dd></div>
              <div><dt>Commitment</dt><dd>{structured.commitment}</dd></div>
              <div><dt>Evidence</dt><dd>{structured.evidence.join(" · ")}</dd></div>
              <div><dt>Published rate</dt><dd>{points} Trust Points</dd></div>
            </dl>
          </div>
          <div className="classification-note"><ShieldCheck size={20} /><span><strong>AI does not award points</strong>An approved impact steward checks the evidence and confirms the contribution.</span></div>
          <button className="primary-button full-width" onClick={submitForReview} disabled={structuring}><CheckCircle size={19} weight="fill" /> {structuring ? "Submitting…" : "Submit for steward review"}</button>
          {error ? <p className="inline-error" role="alert">{error}</p> : null}
        </>
      ) : null}
      {step === "submitted" ? (
        <div className="success-state">
          <CheckCircle size={54} weight="fill" />
          <h3>Awaiting human verification</h3>
          <p>No Trust Points were issued. An approved impact steward must verify the evidence before any protected impact record can change.</p>
          <button className="primary-button full-width" onClick={onClose}>Return to causes</button>
        </div>
      ) : null}
    </DialogShell>
  );
}

export function PayPalDialog({ allocations, onClose, onComplete, onViewImpact }) {
  const [status, setStatus] = useState("loading");
  const [results, setResults] = useState([]);
  const [paymentSession, setPaymentSession] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [environment, setEnvironment] = useState("sandbox");
  const buttonRef = useRef(null);
  const completedRef = useRef(false);
  const initialPendingRef = useRef(readPendingCheckout());
  const checkoutIdRef = useRef(initialPendingRef.current?.checkoutId || globalThis.crypto?.randomUUID?.() || `00000000-0000-4000-8000-${Date.now().toString().padStart(12, "0").slice(-12)}`);
  const total = allocations.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const purchaseUnits = useMemo(() => allocations.map((row, index) => ({
    id: `PU-${String(index + 1).padStart(2, "0")}`,
    cause: row.title,
    recipient: row.creator,
    amount: row.amount,
    type: row.supportType,
  })), [allocations]);

  const requestJson = async (url, options) => {
    const response = await fetch(url, options);
    const contentType = response.headers.get("content-type") || "";
    const data = contentType.includes("application/json") ? await response.json() : {};
    if (!response.ok) {
      const requestError = new Error(data.message || `Checkout request failed (${response.status}).`);
      requestError.code = data.error;
      requestError.debugId = data.debugId;
      throw requestError;
    }
    return data;
  };

  const captureApprovedOrder = async (orderId) => {
    const pending = readPendingCheckout();
    if (!pending?.orderId || pending.orderId !== orderId) {
      clearPayPalReturnParams();
      setError("This PayPal approval does not match the current TrustPal order. Start a new checkout.");
      setStatus("review");
      return false;
    }
    setStatus("capturing");
    setError("");
    try {
      const capture = await requestJson(`/paypal-api/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (capture.status !== "COMPLETED") throw new Error("PayPal returned an incomplete capture.");
      clearPayPalReturnParams();
      clearPendingCheckout();
      setResults(capture.results || []);
      setStatus("complete");
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete(capture.results || []);
      }
      return true;
    } catch (captureError) {
      setError(captureError.message);
      setStatus("review");
      return false;
    }
  };

  const createOrder = async (presentationMode = "auto") => {
    const order = await requestJson("/paypal-api/checkout/orders/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        checkoutId: checkoutIdRef.current,
        currency: "EUR",
        presentationMode,
        allocations: allocations.map(({ id, amount }) => ({ id, amount })),
      }),
    });
    savePendingCheckout({
      checkoutId: checkoutIdRef.current,
      orderId: order.orderId,
      allocations: allocations.map(({ id, amount }) => ({ id, amount })),
    });
    return { orderId: order.orderId };
  };

  const startPayment = async (presentationMode) => {
    if (!paymentSession || starting) return;
    setStarting(true);
    setError("");
    savePendingCheckout({
      checkoutId: checkoutIdRef.current,
      allocations: allocations.map(({ id, amount }) => ({ id, amount })),
    });
    try {
      await paymentSession.start({ presentationMode }, createOrder(presentationMode));
    } catch (paymentError) {
      setError(paymentError.message || "PayPal checkout could not start.");
    } finally {
      setStarting(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initialize = async () => {
      try {
        const token = await requestJson("/paypal-api/auth/browser-safe-client-token");
        const paypal = await loadPayPalSdk(token.environment);
        if (window.isBrowserSupportedByPayPal && !window.isBrowserSupportedByPayPal()) {
          throw new Error("This browser is not supported by PayPal checkout.");
        }
        const sdkInstance = await paypal.createInstance({
          clientToken: token.accessToken,
          components: ["paypal-payments"],
          pageType: "checkout",
          locale: "en-US",
        });
        const eligible = await sdkInstance.findEligibleMethods({
          currencyCode: "EUR",
          amount: total.toFixed(2),
        });
        if (!eligible.isEligible("paypal")) {
          throw new Error("PayPal is not eligible for this Sandbox checkout.");
        }

        const session = sdkInstance.createPayPalOneTimePaymentSession({
          onApprove: async ({ orderId }) => {
            if (cancelled) return;
            await captureApprovedOrder(orderId);
          },
          onCancel: () => {
            if (!cancelled) {
              clearPayPalReturnParams();
              clearPendingCheckout();
              setError("Payment cancelled. No Sandbox funds were captured.");
              setStatus("review");
            }
          },
          onError: (sessionError) => {
            if (!cancelled) {
              clearPayPalReturnParams();
              setError(sessionError?.message || "PayPal could not open the approval flow.");
              setStatus("review");
            }
          },
        });

        if (!cancelled) {
          setEnvironment(token.environment || "sandbox");
          setPaymentSession(session);
          const pending = readPendingCheckout();
          const returnedOrderId = readPayPalReturnOrderId();
          const returnAction = readPayPalReturnAction();
          if (returnAction === "return" && pending?.orderId && pending.orderId === returnedOrderId) {
            setStatus("resuming");
            await captureApprovedOrder(returnedOrderId);
          } else if (returnAction === "cancel") {
            clearPayPalReturnParams();
            clearPendingCheckout();
            setError("Payment cancelled. No Sandbox funds were captured.");
            setStatus("review");
          } else if (session.hasReturned() && pending?.orderId && pending.orderId === returnedOrderId) {
            setStatus("resuming");
            await session.resume();
          } else if (returnAction || session.hasReturned()) {
            clearPayPalReturnParams();
            setError("An old PayPal return was cleared. Review this checkout before continuing.");
            setStatus("review");
          } else {
            setStatus("review");
          }
        }
      } catch (initializationError) {
        if (!cancelled) {
          setError(initializationError.message);
          setStatus("error");
        }
      }
    };

    initialize();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const button = buttonRef.current;
    if (!paymentSession || !button || status !== "review") return undefined;

    const onPayPalButtonClick = () => startPayment("auto");

    button.addEventListener("click", onPayPalButtonClick);
    return () => button.removeEventListener("click", onPayPalButtonClick);
  }, [allocations, paymentSession, starting, status]);

  return (
    <DialogShell title={status === "complete" ? "Payment captured" : "Review with PayPal"} eyebrow={`TrustPal · PayPal ${environment === "sandbox" ? "Sandbox" : "Live"}`} onClose={onClose} wide>
      {status === "loading" ? (
        <div className="processing-state"><span className="spinner" /><h3>Connecting to PayPal Sandbox…</h3><p>Checking payment eligibility and preparing the secure PayPal button.</p></div>
      ) : null}
      {status === "review" ? (
        <>
          <div className="paypal-demo-banner"><InfoIcon /><span><strong>Live PayPal Sandbox checkout</strong>This MVP sends one merchant order with each cause shown as a line item. Per-NGO settlement requires PayPal Commerce Platform onboarding.</span></div>
          <div className="purchase-units">
            <div className="purchase-heading"><span>PayPal order allocations</span><strong>{euro.format(total)}</strong></div>
            {purchaseUnits.map((unit) => (
              <div className="purchase-unit" key={unit.id}>
                <span className="unit-id">{unit.id}</span>
                <div><strong>{unit.cause}</strong><small>Cause allocation: {unit.recipient} · {unit.type}</small></div>
                <strong>{euro.format(unit.amount)}</strong>
              </div>
            ))}
          </div>
          <div className="paypal-consent"><LockKey size={20} /><span>You approve the complete allocation in PayPal before any Sandbox funds are captured.</span></div>
          {error ? <div className="paypal-error" role="alert"><strong>Checkout not completed</strong><span>{error}</span></div> : null}
          <paypal-button ref={buttonRef} type="pay" class="paypal-gold" aria-label={`Pay ${euro.format(total)} with PayPal`}></paypal-button>
          <button className="text-link paypal-redirect" disabled={starting} onClick={() => startPayment("redirect")}>Continue with full-page PayPal checkout</button>
          <p className="fine-print">{starting ? "Opening PayPal Sandbox…" : "Sandbox only. No real money is charged."}</p>
        </>
      ) : null}
      {status === "resuming" ? (
        <div className="processing-state"><span className="spinner" /><h3>Finishing PayPal approval…</h3><p>Restoring your cause allocation before the server-side capture.</p></div>
      ) : null}
      {status === "capturing" ? (
        <div className="processing-state"><span className="spinner" /><h3>Capturing the approved order…</h3><p>TrustPal is waiting for PayPal’s server-side result for each cause allocation.</p></div>
      ) : null}
      {status === "complete" ? (
        <>
          <div className="success-state compact-success"><CheckCircle size={48} weight="fill" /><h3>{euro.format(total)} captured in Sandbox</h3><p>One PayPal capture completed the order. The rows below are TrustPal’s cause-allocation records.</p></div>
          <div className="capture-results">
            {results.map((result) => (
              <div key={result.id}><span>Allocation</span><strong>{result.cause}</strong><span className="ready-state"><CheckCircle size={15} weight="fill" /> {result.status}</span><b>{euro.format(result.amount)}</b></div>
            ))}
          </div>
          <button className="primary-button full-width" onClick={() => { onClose(); onViewImpact?.(); }}>See this capture in Live impact <ArrowRight size={19} weight="bold" /></button>
        </>
      ) : null}
      {status === "error" ? (
        <div className="success-state paypal-unavailable"><InfoIcon /><h3>PayPal checkout unavailable</h3><p>{error}</p><button className="secondary-button" onClick={onClose}>Close</button></div>
      ) : null}
    </DialogShell>
  );
}

function InfoIcon() {
  return <FileText size={21} weight="duotone" />;
}


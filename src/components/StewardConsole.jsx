import { useEffect, useMemo, useState } from "react";
import { AgGridReact } from "ag-grid-react";
import { AllCommunityModule, ModuleRegistry, themeQuartz } from "ag-grid-community";
import { ShieldCheck } from "@phosphor-icons/react";

ModuleRegistry.registerModules([AllCommunityModule]);

export function StewardConsole() {
  const [queue, setQueue] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [token, setToken] = useState("");
  const [credential, setCredential] = useState("");
  const [checks, setChecks] = useState({});
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rehearsal, setRehearsal] = useState({});
  const [notice, setNotice] = useState("");
  const headers = (key = credential) => ({ "Content-Type": "application/json", ...(key ? { Authorization: `Bearer ${key}` } : {}) });
  async function load(key = credential) {
    const response = await fetch("/steward-api/queue", { headers: headers(key) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Review queue is unavailable.");
    setQueue(data);
    return data;
  }
  useEffect(() => { load().catch((e) => setError(e.message)); }, []);
  const rows = useMemo(() => (queue?.offers || []).map((offer) => ({ ...offer, ...rehearsal[offer.id] })), [queue, rehearsal]);
  const selected = rows.find((offer) => offer.id === selectedId);
  const columns = useMemo(() => [
    { field: "contributor", headerName: "Contributor", minWidth: 175, flex: 1 },
    { field: "cause", headerName: "Cause", minWidth: 280, flex: 2 },
    { field: "skill", headerName: "Contribution", minWidth: 180, flex: 1 },
    { field: "hours", headerName: "Hours", width: 90 },
    { headerName: "Points if verified", valueGetter: ({ data }) => data.hours * data.rate, width: 155 },
    { field: "status", headerName: "Review status", width: 160 },
    { headerName: "Review", width: 110, cellRenderer: ({ data }) => <button className="secondary-button" onClick={() => { setSelectedId(data.id); setChecks({}); setReason(""); setNotice(""); }}>Inspect</button> },
  ], []);
  async function authenticate(event) {
    event.preventDefault(); setError("");
    try {
      const data = await load(token);
      if (!data.authenticated) throw new Error("This steward credential was not accepted.");
      setCredential(token); setToken(""); setRehearsal({}); setNotice("Approved steward session active. Credentials are held in memory only.");
    } catch (e) { setError(e.message); }
  }
  async function decide(decision) {
    setError(""); setNotice("");
    if (reason.trim().length < 5) return setError("Add a short review note explaining your decision.");
    if (decision === "verify" && (!checks.attendanceConfirmed || !checks.workConfirmed || !checks.evidenceConfirmed)) return setError("Check all three evidence requirements before verification.");
    if (!queue.authenticated) {
      setRehearsal((current) => ({ ...current, [selected.id]: { status: decision === "verify" ? "Verified (rehearsal)" : "Rejected (rehearsal)" } }));
      setNotice(`Rehearsal complete: ${decision === "verify" ? `${selected.hours * selected.rate} points previewed` : "offer rejected"}. No shared records or Trust Points changed.`);
      return;
    }
    setBusy(true);
    try {
      const response = await fetch(`/steward-api/offers/${selected.id}/review`, { method: "POST", headers: headers(), body: JSON.stringify({ decision, reason, ...checks }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || "Review could not be saved.");
      await load(); setNotice(`Review recorded: ${data.status}. ${data.points} Trust Points issued. The Live impact leaderboard now reflects this review.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <main className="page-shell steward-page">
    <span className="eyebrow"><ShieldCheck size={18} /> Human verification</span>
    <h1>Steward Console</h1>
    <p>Inspect the evidence. Recognize the contribution. Help someone unlock a cause of their own.</p>
    <div className="steward-mode" role="status"><strong>{queue?.authenticated ? "Approved steward" : "Public review rehearsal"}</strong><span>{queue?.authenticated ? "Decisions update shared demo records and the impact leaderboard." : "Practice on fictional examples. Your decisions stay in this page; only an approved steward can issue verified points."}</span></div>
    {!queue?.authenticated ? <details className="steward-access"><summary>Approved steward access</summary>{queue?.verificationConfigured ? <form onSubmit={authenticate}><label htmlFor="steward-token">Steward access token</label><input className="text-input" id="steward-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} /><button className="secondary-button" type="submit">Unlock review actions</button></form> : <p>Shared verification is locked on this demo. You can explore the complete review workflow below in rehearsal mode.</p>}</details> : <button className="secondary-button" onClick={() => { setCredential(""); setSelectedId(null); load("").catch((e) => setError(e.message)); }}>End steward session</button>}
    <section className="steward-queue" aria-label="Contribution review queue">
      <h2>Contribution review queue</h2>
      <p>Teaching: 50 points/hour · Other volunteering: 40 points/hour · Creator Level: 750 points. Rates are set by the server.</p>
      {queue ? <div style={{ height: 350 }}><AgGridReact theme={themeQuartz} rowData={rows} columnDefs={columns} defaultColDef={{ sortable: true, filter: true, resizable: true }} getRowId={({ data }) => data.id} rowHeight={66} /></div> : <p>Loading review queue…</p>}
    </section>
    {selected ? <section className="steward-review" aria-label="Evidence review">
      <h2>{selected.cause}</h2><p>{selected.contributor} · {selected.skill} · {selected.hours} hours · {selected.hours * selected.rate} potential points</p>
      <div className="steward-evidence"><strong>Contribution note</strong><p>{selected.note}</p><strong>Evidence</strong><p>{selected.evidence}</p>{selected.demo ? <small>Fictional example for demonstrating human review.</small> : <small>This is a commitment, not proof of completion. Obtain actual attendance and completion evidence before verifying.</small>}</div>
      {[ ["attendanceConfirmed", "Attendance or participation confirmed"], ["workConfirmed", "Promised work completed"], ["evidenceConfirmed", "Evidence independently checked"] ].map(([key, label]) => <label className="steward-check" key={key}><input type="checkbox" checked={Boolean(checks[key])} onChange={(e) => setChecks({ ...checks, [key]: e.target.checked })} />{label}</label>)}
      <label className="field-label" htmlFor="review-reason">Review note</label><textarea id="review-reason" className="text-area" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="Explain what you checked and why." />
      <div className="steward-actions"><button className="primary-button" disabled={busy || selected.status !== "Pending"} onClick={() => decide("verify")}>{queue?.authenticated ? "Verify and issue points" : "Rehearse verification"}</button><button className="secondary-button" disabled={busy || selected.status !== "Pending"} onClick={() => decide("reject")}>{queue?.authenticated ? "Reject offer" : "Rehearse rejection"}</button></div>
    </section> : <p className="steward-hint">Select Inspect on a contribution to review the evidence and preview its points.</p>}
    {error ? <p className="inline-error" role="alert">{error}</p> : null}{notice ? <p className="steward-notice" role="status">{notice}</p> : null}
    {queue?.audit?.length ? <section className="steward-review"><h2>Review history</h2>{queue.audit.map((entry) => <p key={entry.id}>{entry.decision} · {entry.points} points · {entry.reason}</p>)}</section> : null}
  </main>;
}

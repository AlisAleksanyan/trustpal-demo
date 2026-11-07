import {
  ArrowRight,
  CheckCircle,
  CurrencyEur,
  GraduationCap,
  HandHeart,
  ShieldCheck,
  Sparkle,
  UsersThree,
} from "@phosphor-icons/react";
import { pointRules } from "../data.js";

export function ImpactPage({ profile, onCreate }) {
  const progress = Math.min(100, Math.round((profile.points / profile.creatorThreshold) * 100));
  const creatorUnlocked = profile.points >= profile.creatorThreshold;
  const remaining = Math.max(0, profile.creatorThreshold - profile.points);
  return (
    <main className="page-shell impact-page">
      <section className="impact-hero">
        <div>
          <span className="eyebrow"><ShieldCheck size={17} weight="fill" /> Verified Impact Profile</span>
          <h1>What you contributed becomes what you can build.</h1>
          <p>Trust Points recognize verified money, time, skills, and actions. They are not a credit score and they are never spent.</p>
        </div>
        <div className={creatorUnlocked ? "creator-unlocked" : "creator-unlocked locked"}>
          <CheckCircle size={27} weight="fill" />
          <div><strong>{creatorUnlocked ? "Creator Level unlocked" : `${remaining} points to Creator Level`}</strong><span>{creatorUnlocked ? "You can start a cause of your own." : "Verified contributions move you toward access."}</span></div>
          <button className="primary-button" onClick={onCreate} disabled={!creatorUnlocked}>Create a cause <ArrowRight size={18} weight="bold" /></button>
        </div>
      </section>

      <section className="impact-dashboard">
        <div className="points-panel">
          <span>Total verified Trust Points</span>
          <strong>{profile.points.toLocaleString()}</strong>
          <div className="progress-track large"><span style={{ width: `${progress}%` }} /></div>
          <small>Creator Level threshold: {profile.creatorThreshold} · {creatorUnlocked ? `${profile.points - profile.creatorThreshold} points above threshold` : `${remaining} points remaining`}</small>
          <div className="point-mix">
            <div><HandHeart size={21} /><span>Skills & time</span><strong>{profile.nonMoneyPoints}</strong></div>
            <div><CurrencyEur size={21} /><span>PayPal giving</span><strong>{profile.moneyPoints}</strong></div>
          </div>
        </div>
        <div className="integrity-panel">
          <h2>Why these points are trustworthy</h2>
          <ol>
            <li><Sparkle size={20} weight="fill" /><span><strong>AI structures evidence</strong>It extracts the skill, hours, date, and proof needed.</span></li>
            <li><UsersThree size={20} weight="fill" /><span><strong>A steward verifies the action</strong>The NGO or approved cause steward confirms completion.</span></li>
            <li><ShieldCheck size={20} weight="fill" /><span><strong>A published rule issues points</strong>Every record keeps its verifier and rule version.</span></li>
          </ol>
        </div>
      </section>

      <section className="impact-section">
        <div className="section-heading"><div><span className="eyebrow">Permanent, inspectable records</span><h2>Recent verified contributions</h2></div><span className="record-count">{profile.verifiedContributions} verified · {profile.pendingContributions} pending</span></div>
        <div className="contribution-ledger">
          {(profile.records || []).slice(0, 6).map((record) => {
            const Icon = record.kind === "money" ? CurrencyEur : record.kind === "skill" ? GraduationCap : HandHeart;
            return <div key={record.id}><span className="ledger-icon"><Icon size={21} /></span><div><strong>{record.title}</strong><small>{record.detail}</small></div><b>+{record.points}</b><span className="ready-state"><CheckCircle size={15} weight="fill" /> {record.status}</span></div>;
          })}
        </div>
      </section>

      <section className="rule-card">
        <h2>Published point rules</h2>
        <p>Rules are deterministic and visible before anyone contributes. AI cannot change them.</p>
        <div>{Object.values(pointRules).map((rule) => <span key={rule}>{rule}</span>)}</div>
      </section>
    </main>
  );
}


const euroPrefixPattern = /(?:€|EUR\b)\s?(\d+(?:\.\d{1,2})?)/i;
const euroSuffixPattern = /(\d+(?:\.\d{1,2})?)\s?(?:euros?\b|EUR\b|€)/i;

export function parseAmount(prompt) {
  const match = prompt.match(euroPrefixPattern) || prompt.match(euroSuffixPattern);
  return match ? Math.max(0, Number(match[1])) : 0;
}

function scoreCause(cause, prompt, mode) {
  const normalized = prompt.toLowerCase();
  const matchedTags = cause.matchTags.filter((tag) => normalized.includes(tag));
  const fundingGapRatio = (cause.goal - cause.raised) / cause.goal;
  const urgencyScore = Math.max(0, 1 - cause.urgencyDays / 60);
  const skillMatch =
    mode !== "money" &&
    [cause.skillNeed, cause.skillCategory, ...cause.matchTags]
      .join(" ")
      .toLowerCase()
      .split(/\s+/)
      .some((term) => term.length > 4 && normalized.includes(term));

  return {
    cause,
    score:
      matchedTags.length * 4 +
      fundingGapRatio * 2.5 +
      urgencyScore * 2 +
      (skillMatch ? 4 : 0) +
      (cause.recipientReady ? 0.5 : -2),
    matchedTags,
    skillMatch,
    fundingGapRatio,
  };
}

export function splitTotal(total, weightedRows, mode = "both") {
  const maximumRows = mode === "skills" || total === 0
    ? weightedRows.length
    : Math.max(1, Math.min(weightedRows.length, Math.floor(total)));
  const rows = weightedRows.slice(0, maximumRows);
  if (mode === "skills" || total === 0) return rows.map((row) => ({ ...row, amount: 0 }));

  const guaranteed = rows.length;
  const remainder = Math.max(0, total - guaranteed);
  const totalScore = rows.reduce((sum, row) => sum + Math.max(row.score ?? row.weight ?? 1, 0.5), 0);
  let used = 0;
  return rows.map((row, index) => {
    const amount =
      index === rows.length - 1
        ? Number((total - used).toFixed(2))
        : Number((1 + remainder * (Math.max(row.score ?? row.weight ?? 1, 0.5) / totalScore)).toFixed(2));
    used += amount;
    return { ...row, amount };
  });
}

export function runImpactMatchAgent({ causes, prompt, mode = "both" }) {
  const total = mode === "skills" ? 0 : parseAmount(prompt);
  const scored = causes
    .map((cause) => scoreCause(cause, prompt, mode))
    .filter((row) => mode === "skills" || row.cause.recipientReady)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
  const allocations = splitTotal(total, scored, mode);

  return {
    total,
    mode,
    allocations,
    toolTrace: [
      { label: "Understood your offer", detail: mode === "skills" ? "Skills only · no donation required" : `€${total} · ${mode === "both" ? "money + skills" : mode}` },
      { label: `Compared ${causes.length} demo causes`, detail: "Urgency, funding gaps, skills, recipient readiness" },
      { label: mode === "skills" ? "Found skill opportunities" : "Built an editable plan", detail: "You approve every amount and every skill offer" },
    ],
    source: "rules-fallback",
    modelLabel: "Transparent rules fallback",
    summary:
      mode === "skills"
        ? "These causes have open skill needs. Choose an opportunity to offer your time; no money contribution is required. A steward verifies completed work before points are issued."
        : total === 0
          ? "No donation budget was provided. Enter an amount in euros, such as €25, to prepare a payment plan. You can still offer your skills."
          : "I prioritized causes with urgent deadlines, large remaining gaps, and skill needs related to your offer. Recipient readiness is checked before money enters the plan.",
  };
}

export function hydrateImpactMatch({
  causes,
  prompt,
  mode = "both",
  recommendations,
  summary,
  model,
}) {
  const total = mode === "skills" ? 0 : parseAmount(prompt);
  const byId = new Map(causes.map((cause) => [cause.id, cause]));
  const seen = new Set();
  const ranked = (recommendations || [])
    .map((recommendation, index) => {
      const cause = byId.get(recommendation.causeId);
      if (!cause || seen.has(cause.id)) return null;
      if (mode !== "skills" && !cause.recipientReady) return null;
      seen.add(cause.id);
      return {
        cause,
        weight: Math.max(1, Number(recommendation.weight || 3 - index)),
        score: Math.max(1, Number(recommendation.weight || 3 - index)),
        skillMatch: Boolean(recommendation.skillMatch),
        matchedTags: [],
        fundingGapRatio: (cause.goal - cause.raised) / cause.goal,
        reason: recommendation.reason,
      };
    })
    .filter(Boolean)
    .slice(0, 3);

  if (!ranked.length) return runImpactMatchAgent({ causes, prompt, mode });

  return {
    total,
    mode,
    source: "model",
    modelLabel: model || "AI Gateway model",
    allocations: splitTotal(total, ranked, mode),
    toolTrace: [
      { label: "Understood your offer", detail: mode === "skills" ? "Skills only · no donation required" : `€${total} · ${mode === "both" ? "money + skills" : mode}` },
      { label: `Asked ${model || "the AI model"} to compare ${causes.length} causes`, detail: "Urgency, funding gaps, skills, and recipient readiness" },
      { label: mode === "skills" ? "Returned ranked skill opportunities" : "Built a server-validated editable plan", detail: "You approve every amount and every skill offer" },
    ],
    summary,
  };
}

export function allocationReason(row) {
  if (row.reason) return row.reason;
  const reasons = [];
  if (row.skillMatch) reasons.push("your skills match an open need");
  if (row.fundingGapRatio > 0.35) reasons.push("a significant funding gap remains");
  if (row.cause.urgencyDays <= 18) reasons.push("the deadline is close");
  if (!reasons.length) reasons.push("it fits your selected priorities");
  return reasons.join(" and ");
}


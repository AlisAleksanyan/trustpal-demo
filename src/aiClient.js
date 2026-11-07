import { hydrateImpactMatch, runImpactMatchAgent } from "./impactAgent.js";

async function requestJson(path, payload) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "AI request failed.");
    error.code = data.error;
    throw error;
  }
  return data;
}

export async function requestImpactMatch({ causes, prompt, mode }) {
  try {
    const result = await requestJson("/ai-api/impact-match", {
      prompt,
      mode,
    });
    return hydrateImpactMatch({ causes, prompt, mode, ...result });
  } catch (error) {
    const fallback = runImpactMatchAgent({ causes, prompt, mode });
    return {
      ...fallback,
      fallbackReason: error.code === "AI_NOT_CONFIGURED"
        ? "Connect the Astropods AI Gateway to enable live model matching."
        : "Live AI was unavailable, so no model-generated recommendation is being presented.",
    };
  }
}

export function fallbackSkillEvidence({ skillNeed, hours }) {
  return {
    source: "rules-fallback",
    model: "Transparent rules fallback",
    contribution: skillNeed,
    commitment: `${hours} verified ${hours === 1 ? "hour" : "hours"}`,
    evidence: ["Steward attendance confirmation", "Brief completion note from the contributor"],
    stewardChecklist: ["Confirm the contributor attended", "Confirm the promised work was completed", "Attach the verification date"],
  };
}

export async function requestSkillEvidence(input) {
  try {
    return await requestJson("/ai-api/skill-evidence", input);
  } catch (error) {
    return { ...fallbackSkillEvidence(input), fallbackReason: error.message };
  }
}

export function fallbackCauseDraft({ story, goal, skillNeed }) {
  const tuition = Number((goal * 0.78).toFixed(2));
  const materials = Number((goal * 0.12).toFixed(2));
  return {
    source: "rules-fallback",
    model: "Transparent rules fallback",
    summary: story,
    milestones: ["Provide eligibility or need evidence", "Confirm the first funded milestone", "Publish a progress update after funds are used"],
    budget: [
      { label: "Primary project cost", amount: tuition },
      { label: "Materials and access", amount: materials },
      { label: "Delivery and contingency", amount: Number((goal - tuition - materials).toFixed(2)) },
    ],
    evidence: ["Proof of the stated need", "Receipts or invoices for funded costs", "A public completion update"],
    category: "Other",
    supportType: "Personal support",
    skillNeed,
  };
}

export async function requestCauseDraft(input) {
  try {
    return await requestJson("/ai-api/cause-draft", input);
  } catch (error) {
    return { ...fallbackCauseDraft(input), fallbackReason: error.message };
  }
}

export async function requestDashboardInsight(prompt) {
  return requestJson("/ai-api/dashboard-insight", { prompt });
}

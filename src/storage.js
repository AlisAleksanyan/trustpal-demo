const APP_STATE_KEY = "trustpal.app-state.v3";
const APP_STATE_VERSION = 3;

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function loadAppState(seedProfile, seedCauses, storage = globalThis.localStorage) {
  if (!storage) return { profile: clone(seedProfile), causes: clone(seedCauses) };
  try {
    const saved = JSON.parse(storage.getItem(APP_STATE_KEY) || "null");
    if (saved?.version !== APP_STATE_VERSION || !Array.isArray(saved.draftCauses)) {
      return { profile: clone(seedProfile), causes: clone(seedCauses) };
    }
    const seedIds = new Set(seedCauses.map((cause) => cause.id));
    const draftCauses = saved.draftCauses
      .filter((cause) => !seedIds.has(cause?.id))
      .map((cause) => sanitizeDraftCause(cause, seedProfile))
      .filter(Boolean);
    return {
      profile: clone(seedProfile),
      causes: [...draftCauses, ...clone(seedCauses)],
    };
  } catch {
    return { profile: clone(seedProfile), causes: clone(seedCauses) };
  }
}

export function saveAppState(profile, causes, storage = globalThis.localStorage) {
  if (!storage) return false;
  try {
    const draftCauses = causes
      .map((cause) => sanitizeDraftCause(cause, profile))
      .filter(Boolean);
    storage.setItem(APP_STATE_KEY, JSON.stringify({ version: APP_STATE_VERSION, draftCauses }));
    return true;
  } catch {
    return false;
  }
}

function safeText(value, max) {
  return String(value || "").trim().slice(0, max);
}

function safeStringList(value, maxItems, maxLength) {
  return Array.isArray(value)
    ? value.map((item) => safeText(item, maxLength)).filter(Boolean).slice(0, maxItems)
    : [];
}

function sanitizeDraftCause(cause, profile) {
  if (!cause || cause.reviewStatus !== "pending" || cause.creatorType !== "creator") return null;
  const id = safeText(cause.id, 100);
  const title = safeText(cause.title, 180);
  const description = safeText(cause.description, 500);
  const skillNeed = safeText(cause.skillNeed, 180);
  const goal = Math.min(100_000, Math.max(50, Number(cause.goal) || 50));
  if (!id || !title || !description || !skillNeed) return null;
  const allowedCategories = new Set(["Education", "Community", "Climate", "Health", "Other"]);
  const category = allowedCategories.has(cause.category) ? cause.category : "Other";
  return {
    id,
    title,
    creator: safeText(profile?.name, 120) || "Demo contributor",
    creatorType: "creator",
    verified: false,
    points: Number(profile?.points) || 0,
    category,
    supportType: safeText(cause.supportType, 100) || "Personal support",
    description,
    raised: 0,
    goal,
    urgencyDays: 45,
    urgencyText: "Human review before publishing",
    skillNeed,
    skillCategory: category === "Education" ? "Mentoring" : "Community",
    skillHours: 3,
    location: "Creator-selected · Details under review",
    image: "/assets/causes/maya-study-v2.jpg",
    recipientReady: false,
    reviewStatus: "pending",
    matchTags: safeStringList(cause.matchTags, 10, 50),
    milestones: safeStringList(cause.milestones, 5, 180),
    budget: Array.isArray(cause.budget)
      ? cause.budget.slice(0, 6).map((item) => ({
        label: safeText(item?.label, 100),
        amount: Math.max(0, Math.min(goal, Number(item?.amount) || 0)),
      })).filter((item) => item.label)
      : [],
    evidence: safeStringList(cause.evidence, 5, 180),
  };
}

export function createUserCause(draft, structuredDraft, profile, now = Date.now()) {
  const slug = draft.title
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 54) || "creator-cause";
  const category = structuredDraft?.category || "Other";
  return {
    id: `${slug}-${String(now).slice(-6)}`,
    title: draft.title.trim(),
    creator: profile.name,
    creatorType: "creator",
    verified: false,
    points: profile.points,
    category,
    supportType: structuredDraft?.supportType || "Personal support",
    description: structuredDraft?.summary || draft.story.trim(),
    raised: 0,
    goal: Number(draft.goal),
    urgencyDays: 45,
    urgencyText: "Human review before publishing",
    skillNeed: draft.skillNeed.trim(),
    skillCategory: category === "Education" ? "Mentoring" : "Community",
    skillHours: 3,
    location: "Creator-selected · Details under review",
    image: "/assets/causes/maya-study-v2.jpg",
    recipientReady: false,
    reviewStatus: "pending",
    matchTags: [category, draft.skillNeed, draft.title]
      .join(" ")
      .toLowerCase()
      .split(/\W+/)
      .filter((tag) => tag.length > 3)
      .slice(0, 10),
    milestones: structuredDraft?.milestones || [],
    budget: structuredDraft?.budget || [],
    evidence: structuredDraft?.evidence || [],
  };
}

export { APP_STATE_KEY };

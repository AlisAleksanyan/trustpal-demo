import crypto from "node:crypto";

const DEMO_DONORS = [
  "Kind Neighbor",
  "Skills Giver",
  "Community Builder",
  "Future Teacher",
  "Local Fixer",
  "Climate Helper",
  "Learning Ally",
  "Quiet Supporter",
];

const DEMO_AMOUNTS = [18, 25, 40, 12, 65, 30, 22, 50, 15, 35, 28, 75];

function publicCaptureId(value) {
  const safe = String(value || "");
  return safe.length > 10 ? `${safe.slice(0, 6)}…${safe.slice(-4)}` : safe;
}

function donorAlias(captureId) {
  const digest = crypto.createHash("sha256").update(String(captureId)).digest("hex").slice(0, 4).toUpperCase();
  return `Sandbox Supporter ${digest}`;
}

function seededDonations(causes, now) {
  const timestamp = now();
  return DEMO_AMOUNTS.map((amount, index) => {
    const cause = causes[index % Math.min(causes.length, 12)];
    const captureId = `DEMO-${String(index + 1).padStart(4, "0")}`;
    return {
      eventId: `demo:${index + 1}`,
      occurredAt: new Date(timestamp - (index + 1) * 37 * 60_000).toISOString(),
      orderId: `DEMO-ORDER-${String(index + 1).padStart(4, "0")}`,
      captureId,
      captureReference: captureId,
      causeId: cause.id,
      cause: cause.title,
      category: cause.category,
      creator: cause.creator,
      donorAlias: DEMO_DONORS[index % DEMO_DONORS.length],
      amount,
      currency: "EUR",
      status: "COMPLETED",
      webhookVerified: true,
      source: "Demo history",
      live: false,
    };
  });
}

function seededSkillActivity(causes) {
  return causes.slice(0, 10).map((cause, index) => ({
    offerId: `SKILL-DEMO-${String(index + 1).padStart(3, "0")}`,
    causeId: cause.id,
    cause: cause.title,
    category: cause.skillCategory || "Volunteer",
    skill: cause.skillNeed || "Community support",
    hours: cause.skillHours || 2,
    status: index < 6 ? "Verified" : "Open need",
    points: index < 6 ? (cause.skillCategory === "Teaching" ? 50 : 40) * (cause.skillHours || 2) : 0,
  }));
}

export function createImpactStore({ causes, now = Date.now }) {
  const canonicalCauses = causes.filter((cause) => cause.reviewStatus !== "pending");
  const demoDonations = seededDonations(canonicalCauses, now);
  const liveDonations = new Map();
  const processedWebhookIds = new Set();
  const skillActivity = seededSkillActivity(canonicalCauses);
  const reviewQueue = new Map(canonicalCauses.slice(0, 3).map((cause, index) => {
    const id = `REVIEW-DEMO-${index + 1}`;
    return [id, { id, causeId: cause.id, cause: cause.title, contributor: `Demo Volunteer ${index + 1}`, skill: cause.skillNeed,
      hours: 2, rate: cause.skillCategory === "Teaching" ? 50 : 40, status: "Pending", demo: true,
      note: `Completed two hours of ${cause.skillNeed.toLowerCase()}.`, evidence: "Fictional attendance log and completion note supplied for the hackathon review demonstration." }];
  }));
  const reviewAudit = [];

  function invalid(message, status = 400) { const error = new Error(message); error.status = status; throw error; }
  function submitOffer(input) {
    const cause = canonicalCauses.find((item) => item.id === input.causeId);
    if (!cause?.skillNeed || !Number.isInteger(input.hours) || input.hours < 1 || input.hours > 20
      || typeof input.note !== "string" || input.note.trim().length < 3 || input.note.length > 600) invalid("Choose a published cause, 1–20 hours, and a note of 3–600 characters.");
    const id = crypto.randomUUID();
    // Notes are not published to other anonymous visitors. No user-supplied point rate is accepted.
    reviewQueue.set(id, { id, causeId: cause.id, cause: cause.title, contributor: `Demo Volunteer ${id.slice(0, 6)}`, skill: cause.skillNeed,
      hours: input.hours, rate: cause.skillCategory === "Teaching" ? 50 : 40, status: "Pending", demo: false,
      note: input.note.trim(), evidence: "Evidence must be checked by the approved steward before verification." });
    while (reviewQueue.size > 200) reviewQueue.delete([...reviewQueue.keys()].find((key) => !key.startsWith("REVIEW-DEMO-")));
    return { id, status: "Pending", pointsIssued: 0 };
  }
  function readStewardQueue({ privateDetails = false } = {}) {
    return { offers: [...reviewQueue.values()].map(({ note, ...offer }) => ({ ...offer, note: offer.demo || privateDetails ? note : "Private submission: details available to the steward during review." })), audit: reviewAudit.map((entry) => ({ ...entry, reason: entry.demo || privateDetails ? entry.reason : "Reviewed by an approved steward." })) };
  }
  function reviewOffer(id, input) {
    const offer = reviewQueue.get(id);
    if (!offer) invalid("Offer not found.", 404);
    if (!["verify", "reject"].includes(input.decision) || typeof input.reason !== "string" || input.reason.trim().length < 5 || input.reason.length > 300) invalid("Choose a decision and give a review note of 5–300 characters.");
    if (offer.status !== "Pending") invalid("This offer has already been reviewed.", 409);
    if (input.decision === "verify" && (input.attendanceConfirmed !== true || input.workConfirmed !== true || input.evidenceConfirmed !== true)) invalid("Confirm attendance, completion, and evidence before issuing points.");
    offer.status = input.decision === "verify" ? "Verified" : "Rejected";
    const points = offer.status === "Verified" ? offer.hours * offer.rate : 0;
    const entry = { id: crypto.randomUUID(), offerId: id, decision: offer.status, points, reason: input.reason.trim(), occurredAt: new Date(now()).toISOString(), demo: offer.demo };
    reviewAudit.unshift(entry);
    if (points) skillActivity.push({ offerId: id, contributor: offer.contributor, causeId: offer.causeId, cause: offer.cause, category: "Volunteer", skill: offer.skill, hours: offer.hours, status: "Verified", points });
    return { ...entry, status: offer.status };
  }

  function recordCapture(capture) {
    if (capture?.status !== "COMPLETED" || !Array.isArray(capture.results)) return [];
    const recorded = [];
    for (const result of capture.results) {
      if (result.status !== "COMPLETED" || !result.captureId) continue;
      const cause = canonicalCauses.find((item) => item.id === result.id);
      if (!cause) continue;
      const eventId = `${result.captureId}:${result.id}`;
      const existing = liveDonations.get(eventId);
      if (existing) {
        recorded.push(existing);
        continue;
      }
      const event = {
        eventId,
        occurredAt: new Date(now()).toISOString(),
        orderId: capture.orderId,
        captureId: result.captureId,
        captureReference: publicCaptureId(result.captureId),
        causeId: result.id,
        cause: cause.title,
        category: cause.category,
        creator: cause.creator,
        donorAlias: donorAlias(result.captureId),
        amount: Number(result.amount),
        currency: result.currency || "EUR",
        status: "COMPLETED",
        webhookVerified: false,
        source: "PayPal Sandbox",
        live: true,
      };
      liveDonations.set(eventId, event);
      recorded.push(event);
    }
    return recorded;
  }

  function applyWebhook(event) {
    if (!event?.id || processedWebhookIds.has(event.id)) return { duplicate: true, updated: 0 };
    processedWebhookIds.add(event.id);
    const captureId = String(event.resource?.id || "");
    if (!captureId) return { duplicate: false, updated: 0 };
    const statusByType = {
      "PAYMENT.CAPTURE.COMPLETED": "COMPLETED",
      "PAYMENT.CAPTURE.DENIED": "DENIED",
      "PAYMENT.CAPTURE.REFUNDED": "REFUNDED",
    };
    const nextStatus = statusByType[event.event_type];
    if (!nextStatus) return { duplicate: false, updated: 0 };
    let updated = 0;
    for (const donation of liveDonations.values()) {
      if (donation.captureId !== captureId) continue;
      donation.status = nextStatus;
      donation.webhookVerified = true;
      donation.webhookEventId = event.id;
      updated += 1;
    }
    return { duplicate: false, updated };
  }

  function readDashboard() {
    const live = [...liveDonations.values()];
    const donations = [...live, ...demoDonations].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
    const completedLiveByCause = new Map();
    for (const donation of live) {
      if (donation.status !== "COMPLETED") continue;
      completedLiveByCause.set(donation.causeId, (completedLiveByCause.get(donation.causeId) || 0) + donation.amount);
    }
    const campaigns = canonicalCauses.map((cause) => {
      const liveRaised = Number((completedLiveByCause.get(cause.id) || 0).toFixed(2));
      const raised = Number((cause.raised + liveRaised).toFixed(2));
      const remaining = Math.max(0, Number((cause.goal - raised).toFixed(2)));
      return {
        causeId: cause.id,
        cause: cause.title,
        creator: cause.creator,
        creatorType: cause.creatorType === "ngo" ? "Verified NGO" : "Creator Level",
        category: cause.category,
        raised,
        liveRaised,
        goal: cause.goal,
        remaining,
        fundingPercent: Math.min(100, Math.round((raised / cause.goal) * 100)),
        deadlineDays: cause.urgencyDays,
        skillNeed: cause.skillNeed,
        volunteerHoursNeeded: cause.skillHours || 0,
        recipientReady: Boolean(cause.recipientReady),
      };
    });
    const contributorMap = new Map();
    for (const donation of donations) {
      if (donation.status !== "COMPLETED") continue;
      const current = contributorMap.get(donation.donorAlias) || {
        contributor: donation.donorAlias,
        moneyPoints: 0,
        skillPoints: 0,
        verifiedContributions: 0,
        causesSupported: new Set(),
      };
      current.moneyPoints += Math.round(donation.amount);
      current.verifiedContributions += 1;
      current.causesSupported.add(donation.causeId);
      contributorMap.set(donation.donorAlias, current);
    }
    for (const [index, activity] of skillActivity.entries()) {
      if (activity.status !== "Verified") continue;
      const alias = activity.contributor || DEMO_DONORS[index % DEMO_DONORS.length];
      const current = contributorMap.get(alias) || {
        contributor: alias,
        moneyPoints: 0,
        skillPoints: 0,
        verifiedContributions: 0,
        causesSupported: new Set(),
      };
      current.skillPoints += activity.points;
      current.verifiedContributions += 1;
      current.causesSupported.add(activity.causeId);
      contributorMap.set(alias, current);
    }
    const contributors = [...contributorMap.values()].map((contributor) => ({
      ...contributor,
      totalPoints: contributor.moneyPoints + contributor.skillPoints,
      causesSupported: contributor.causesSupported.size,
      creatorUnlocked: contributor.moneyPoints + contributor.skillPoints >= 750,
    })).sort((a, b) => b.totalPoints - a.totalPoints);
    const completed = donations.filter((donation) => donation.status === "COMPLETED");
    const totalGiving = completed.reduce((sum, donation) => sum + donation.amount, 0);
    const verifiedSkillHours = skillActivity.filter((item) => item.status === "Verified").reduce((sum, item) => sum + item.hours, 0);
    return {
      generatedAt: new Date(now()).toISOString(),
      sandboxOnly: true,
      settlementMode: "single-merchant allocation demo",
      summary: {
        totalGiving: Number(totalGiving.toFixed(2)),
        liveSandboxGiving: Number(live.filter((item) => item.status === "COMPLETED").reduce((sum, item) => sum + item.amount, 0).toFixed(2)),
        activeCampaigns: campaigns.length,
        verifiedSkillHours,
        openSkillNeeds: skillActivity.filter((item) => item.status === "Open need").length,
        webhookVerified: live.filter((item) => item.webhookVerified).length,
      },
      donations,
      campaigns,
      contributors,
      skillActivity,
    };
  }

  return { applyWebhook, readDashboard, recordCapture, submitOffer, readStewardQueue, reviewOffer };
}

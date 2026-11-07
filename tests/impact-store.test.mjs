import test from "node:test";
import assert from "node:assert/strict";
import { createImpactStore } from "../server/impact-store.mjs";

const causes = [
  { id: "education", title: "Education cause", creator: "Learning NGO", creatorType: "ngo", category: "Education", raised: 100, goal: 1000, urgencyDays: 10, skillNeed: "Teachers", skillCategory: "Teaching", skillHours: 2, recipientReady: true },
  { id: "park", title: "Park cause", creator: "Local creator", creatorType: "creator", category: "Community", raised: 200, goal: 800, urgencyDays: 20, skillNeed: "Painters", skillCategory: "Hands-on", skillHours: 4, recipientReady: true },
];

function capture(overrides = {}) {
  return {
    orderId: "ORDER-1",
    status: "COMPLETED",
    results: [{ id: "education", cause: "Education cause", amount: 25, currency: "EUR", status: "COMPLETED", captureId: "CAPTURE-1" }],
    ...overrides,
  };
}

test("separates fictional demo history from live Sandbox captures", () => {
  const store = createImpactStore({ causes, now: () => Date.UTC(2026, 10, 5, 12) });
  const initial = store.readDashboard();
  assert.equal(initial.summary.liveSandboxGiving, 0);
  assert.ok(initial.donations.every((donation) => donation.source === "Demo history" && donation.live === false));

  store.recordCapture(capture());
  const updated = store.readDashboard();
  assert.equal(updated.summary.liveSandboxGiving, 25);
  assert.equal(updated.donations[0].source, "PayPal Sandbox");
  assert.equal(updated.donations[0].live, true);
  assert.equal(updated.campaigns.find((campaign) => campaign.causeId === "education").raised, 125);
});

test("capture recording is idempotent and ignores incomplete payments", () => {
  const store = createImpactStore({ causes });
  assert.deepEqual(store.recordCapture(capture({ status: "APPROVED" })), []);
  store.recordCapture(capture());
  store.recordCapture(capture());
  assert.equal(store.readDashboard().donations.filter((donation) => donation.live).length, 1);
});

test("verified webhooks reconcile live events without trusting duplicates", () => {
  const store = createImpactStore({ causes });
  store.recordCapture(capture());
  const event = { id: "WEBHOOK-1", event_type: "PAYMENT.CAPTURE.REFUNDED", resource: { id: "CAPTURE-1" } };
  assert.deepEqual(store.applyWebhook(event), { duplicate: false, updated: 1 });
  assert.deepEqual(store.applyWebhook(event), { duplicate: true, updated: 0 });
  const donation = store.readDashboard().donations.find((item) => item.live);
  assert.equal(donation.status, "REFUNDED");
  assert.equal(donation.webhookVerified, true);
  assert.equal(store.readDashboard().summary.liveSandboxGiving, 0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { hydrateImpactMatch, parseAmount, runImpactMatchAgent, splitTotal } from "../src/impactAgent.js";

const causes = [
  { id: "one", title: "One", recipientReady: true, goal: 100, raised: 20, urgencyDays: 5, matchTags: ["education"], skillNeed: "Teaching", skillCategory: "Education" },
  { id: "two", title: "Two", recipientReady: true, goal: 100, raised: 40, urgencyDays: 12, matchTags: ["community"], skillNeed: "Repair", skillCategory: "Community" },
  { id: "three", title: "Three", recipientReady: true, goal: 100, raised: 60, urgencyDays: 30, matchTags: ["climate"], skillNeed: "Cleanup", skillCategory: "Climate" },
  { id: "pending", title: "Pending", recipientReady: false, goal: 100, raised: 0, urgencyDays: 1, matchTags: ["education"], skillNeed: "Teaching", skillCategory: "Education" },
];

test("parses euro amounts in prefix and suffix forms", () => {
  assert.equal(parseAmount("split €25 across education"), 25);
  assert.equal(parseAmount("I can give 12.50 euros"), 12.5);
});

test("a one-euro plan creates one valid PayPal allocation", () => {
  const rows = splitTotal(1, causes.slice(0, 3).map((cause) => ({ cause, score: 1 })));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].amount, 1);
});

test("money plans preserve the exact total and the one-euro minimum", () => {
  const result = runImpactMatchAgent({ causes, prompt: "Give €3 to education and climate", mode: "money" });
  assert.equal(result.allocations.reduce((sum, row) => sum + row.amount, 0), 3);
  assert.ok(result.allocations.every((row) => row.amount >= 1));
  assert.ok(result.allocations.every((row) => row.cause.recipientReady));
});

test("model recommendations are deduplicated and pending recipients are rejected", () => {
  const result = hydrateImpactMatch({
    causes,
    prompt: "€10 for education",
    mode: "money",
    model: "test/model",
    summary: "A model result",
    recommendations: [
      { causeId: "pending", weight: 9, reason: "Not payable" },
      { causeId: "one", weight: 5, reason: "Education match" },
      { causeId: "one", weight: 4, reason: "Duplicate" },
      { causeId: "two", weight: 2, reason: "Secondary match" },
    ],
  });
  assert.equal(result.source, "model");
  assert.deepEqual(result.allocations.map((row) => row.cause.id), ["one", "two"]);
  assert.equal(result.allocations.reduce((sum, row) => sum + row.amount, 0), 10);
});

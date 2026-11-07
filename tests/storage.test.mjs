import test from "node:test";
import assert from "node:assert/strict";
import { APP_STATE_KEY, createUserCause, loadAppState, saveAppState } from "../src/storage.js";

function memoryStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

const profile = { name: "Maya", points: 1050, records: [] };
const seedCause = {
  id: "seed",
  title: "Published cause",
  raised: 100,
  creatorType: "ngo",
  reviewStatus: "approved",
};

test("anonymous storage cannot modify protected profile or published cause records", () => {
  const storage = memoryStorage();
  const draft = createUserCause(
    { title: "Repair our park", story: "A neighborhood repair effort", goal: 2500, skillNeed: "Landscape planning" },
    { category: "Community", supportType: "Community project", summary: "Repair the local park", milestones: ["Survey"], budget: [], evidence: [] },
    profile,
    123456789,
  );

  assert.equal(saveAppState(
    { ...profile, points: 999999, records: [{ status: "Verified", points: 999999 }] },
    [{ ...seedCause, raised: 999999 }, { ...draft, raised: 5000, verified: true, recipientReady: true }],
    storage,
  ), true);

  const loaded = loadAppState(profile, [seedCause], storage);
  assert.equal(loaded.profile.points, 1050);
  assert.deepEqual(loaded.profile.records, []);
  assert.equal(loaded.causes[1].raised, 100);
  assert.equal(loaded.causes[0].raised, 0);
  assert.equal(loaded.causes[0].verified, false);
  assert.equal(loaded.causes[0].recipientReady, false);
  assert.equal(loaded.causes[0].reviewStatus, "pending");
  assert.ok(storage.getItem(APP_STATE_KEY));
});

test("only sanitized pending drafts survive an anonymous storage round trip", () => {
  const storage = memoryStorage();
  storage.setItem(APP_STATE_KEY, JSON.stringify({
    version: 3,
    draftCauses: [
      { id: "fake-approved", creatorType: "creator", reviewStatus: "approved", title: "Fake" },
      {
        id: "pending-draft",
        creatorType: "creator",
        reviewStatus: "pending",
        title: "Community garden",
        description: "A draft community garden cause",
        skillNeed: "Garden planning",
        goal: 3000,
        raised: 3000,
        verified: true,
        recipientReady: true,
      },
    ],
  }));

  const loaded = loadAppState(profile, [seedCause], storage);
  assert.deepEqual(loaded.causes.map((cause) => cause.id), ["pending-draft", "seed"]);
  assert.equal(loaded.causes[0].raised, 0);
  assert.equal(loaded.causes[0].verified, false);
  assert.equal(loaded.causes[0].recipientReady, false);
});

test("creator causes are pending and cannot accept PayPal payments before review", () => {
  const cause = createUserCause(
    { title: "Repair our park", story: "A neighborhood repair effort", goal: 2500, skillNeed: "Landscape planning" },
    { category: "Community", supportType: "Community project", summary: "Repair the local park", milestones: ["Survey"], budget: [], evidence: [] },
    profile,
    123456789,
  );
  assert.equal(cause.reviewStatus, "pending");
  assert.equal(cause.recipientReady, false);
  assert.equal(cause.raised, 0);
  assert.match(cause.id, /^repair-our-park-/);
});

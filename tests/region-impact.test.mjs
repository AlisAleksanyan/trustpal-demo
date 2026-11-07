import test from "node:test";
import assert from "node:assert/strict";
import { buildRegionImpact, countryForLocation, coverageTone } from "../src/regionImpact.js";

const countries = [{ id: "ARM", name: "Armenia", label: [44.8, 40.3] }, { id: "ESP", name: "Spain", label: [-3.6, 40.1] }, { id: "GBR", name: "United Kingdom", label: [-2, 54] }];
const catalogue = [{ id: "school", location: "Lori, Armenia · Remote friendly" }, { id: "park", location: "Madrid, Spain · In person" }];
const campaign = (id, extra = {}) => ({ causeId: id, cause: id, goal: 1000, raised: 200, liveRaised: 0, skillNeed: "Teaching", volunteerHoursNeeded: 2, ...extra });
const receipt = (id, causeId, amount, extra = {}) => ({ eventId: id, captureId: id, causeId, amount, status: "COMPLETED", currency: "EUR", live: true, source: "PayPal Sandbox", ...extra });
const read = (campaigns, donations = [], source = "live") => buildRegionImpact({ campaigns, donations }, catalogue, countries, source);

test("joins by cause ID and cause location, never donor location", () => {
  const model = read([campaign("school")], [receipt("one", "school", 10, { donorLocation: "Madrid, Spain" })]);
  assert.equal(model.regions[0].id, "ARM");
  assert.deepEqual(model.regions[0].coordinates, [44.8, 40.3]);
  assert.equal(countryForLocation("Manchester, UK · Hybrid", countries).id, "GBR");
  assert.equal(countryForLocation("Remote friendly", countries), null);
});

test("contribution share and weighted campaign coverage have different denominators", () => {
  const model = read([campaign("school", { raised: 600 }), campaign("park", { raised: 100 })], [receipt("one", "school", 10), receipt("two", "park", 30)]);
  const armenia = model.regions.find((region) => region.id === "ARM");
  assert.equal(armenia.coverage, 60);
  assert.equal(armenia.share, 25);
  assert.equal(armenia.remaining, 400);
});

test("does not add illustrative feed receipts to campaign balances or double-add captures", () => {
  const campaigns = [campaign("school", { raised: 610, liveRaised: 10 })];
  const donations = [receipt("one", "school", 10), receipt("demo", "school", 18, { live: false, source: "Demo history" })];
  const live = read(campaigns, donations).regions[0];
  const all = read(campaigns, donations, "all").regions[0];
  assert.equal(live.raised, 610);
  assert.equal(all.raised, 610);
  assert.equal(all.demoFunding, 600);
  assert.equal(all.liveFunding, 10);
  assert.equal(live.received, 10);
  assert.equal(all.received, 28);
  assert.equal(all.skillNeeds[0].volunteerHoursNeeded, 2);
});

test("counts only completed EUR receipts and never assumes currency conversion", () => {
  const model = read([campaign("school")], [receipt("ok", "school", 10), receipt("refund", "school", 50, { status: "REFUNDED" }), receipt("pending", "school", 50, { status: "APPROVED" }), receipt("usd", "school", 50, { currency: "USD" })]);
  assert.equal(model.receiptTotal, 10);
  assert.equal(model.excludedCurrency, 1);
});

test("keeps unlocated causes and unmatched receipts out of markers but inside share totals", () => {
  const model = read([campaign("school"), campaign("unknown")], [receipt("one", "school", 10), receipt("two", "unknown", 10), receipt("three", "not-published", 20)]);
  assert.equal(model.regions.length, 1);
  assert.equal(model.unlocated.causes.length, 1);
  assert.equal(model.unlocated.received, 30);
  assert.equal(model.unlocated.unmatchedReceipts, 1);
  assert.equal(model.regions[0].share, 25);
  assert.equal(model.totalCauses, 2);
});

test("empty receipts and missing funding are unavailable, not invented zero percentages", () => {
  const model = read([campaign("school", { goal: null, raised: null })]);
  assert.equal(model.regions[0].share, null);
  assert.equal(model.regions[0].coverage, null);
  assert.equal(model.regions[0].missingFunding, 1);
  assert.equal(read([]).regions.length, 0);
});

test("deduplicates allocation events, while allowing a capture to support different causes", () => {
  const first = receipt("one", "school", 10);
  const model = read([campaign("school"), campaign("park")], [first, first, receipt("two", "park", 20, { captureId: "one" })]);
  assert.equal(model.receiptTotal, 30);
  assert.equal(model.regions.reduce((sum, region) => sum + region.receiptCount, 0), 2);
});

test("keeps money arithmetic in cents and region gaps do not hide unfunded causes", () => {
  const model = read([campaign("school", { goal: 100, raised: 200 }), campaign("park", { goal: 100, raised: 0 })], [receipt("one", "school", .1), receipt("two", "school", .2)]);
  assert.equal(model.receiptTotal, .3);
  assert.equal(model.totalGap, 100);
  assert.equal(coverageTone(59.9), "underserved");
  assert.equal(coverageTone(60), "building");
  assert.equal(coverageTone(80), "supported");
});

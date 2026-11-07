import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createStewardMiddleware } from "../server/steward-api.mjs";
import { createImpactStore } from "../server/impact-store.mjs";
import { causes } from "../src/data.js";

const token = "test-only-steward-credential-1234567890";
function setup() {
  const store = createImpactStore({ causes });
  return { store, middleware: createStewardMiddleware(store, { STEWARD_ACCESS_TOKEN: token }) };
}
async function request(middleware, url, body, credential, origin = "https://trustpal.example") {
  const req = Readable.from([JSON.stringify(body || {})]);
  Object.assign(req, { url, method: body ? "POST" : "GET", headers: { host: "trustpal.example", origin, ...(credential ? { authorization: `Bearer ${credential}` } : {}) }, socket: { remoteAddress: "127.0.0.1" } });
  const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, end(value) { this.body = JSON.parse(value); } };
  await middleware(req, res, () => assert.fail("route not handled"));
  return res;
}
const decision = { decision: "verify", reason: "Independently checked the example evidence.", attendanceConfirmed: true, workConfirmed: true, evidenceConfirmed: true, points: 999999 };

test("anonymous and forged credentials cannot change protected points", async () => {
  const { store, middleware } = setup();
  const before = store.readDashboard();
  for (const credential of [undefined, "wrong", "é".repeat(token.length)]) {
    const result = await request(middleware, "/steward-api/offers/REVIEW-DEMO-1/review", decision, credential);
    assert.equal(result.statusCode, 403);
  }
  assert.deepEqual(store.readDashboard().contributors, before.contributors);
  assert.equal(store.readStewardQueue().audit.length, 0);
});
test("approved review requires boolean checks, uses server rates and cannot issue twice", async () => {
  const { store, middleware } = setup();
  const path = "/steward-api/offers/REVIEW-DEMO-1/review";
  assert.equal((await request(middleware, path, { ...decision, evidenceConfirmed: "true" }, token)).statusCode, 400);
  const beforeHours = store.readDashboard().summary.verifiedSkillHours;
  const result = await request(middleware, path, decision, token);
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.points, 100);
  assert.equal(store.readDashboard().summary.verifiedSkillHours, beforeHours + 2);
  assert.equal(store.readDashboard().contributors.find((row) => row.contributor === "Demo Volunteer 1").skillPoints, 100);
  assert.equal((await request(middleware, path, decision, token)).statusCode, 409);
  assert.equal(store.readStewardQueue().audit.length, 1);
});
test("submitted offers stay pending, private, and carry no client-controlled points", async () => {
  const { store, middleware } = setup();
  const before = store.readDashboard().summary.verifiedSkillHours;
  const submitted = await request(middleware, "/steward-api/offers", { causeId: "armenia-learning", hours: 2, note: "Private example submission", points: 9999 });
  assert.equal(submitted.statusCode, 201);
  assert.equal(submitted.body.pointsIssued, 0);
  const publicQueue = await request(middleware, "/steward-api/queue");
  assert.doesNotMatch(JSON.stringify(publicQueue.body), /Private example submission|test-only-steward/);
  const privateQueue = await request(middleware, "/steward-api/queue", undefined, token);
  assert.match(JSON.stringify(privateQueue.body), /Private example submission/);
  assert.equal(privateQueue.body.authenticated, true);
  assert.equal(store.readDashboard().summary.verifiedSkillHours, before);
  assert.equal((await request(middleware, "/steward-api/offers", { causeId: "armenia-learning", hours: 2, note: "Cross origin" }, undefined, "https://attacker.example")).statusCode, 403);
});

import assert from "node:assert/strict";
import test from "node:test";
import { createImpactMiddleware } from "../server/impact-api.mjs";

function request(pathname, method = "GET") {
  return { method, url: pathname };
}

function response() {
  return {
    body: "",
    headers: new Map(),
    statusCode: 0,
    setHeader(name, value) { this.headers.set(name, value); },
    end(chunk = "") { this.body += chunk; },
  };
}

test("impact dashboard returns the read-only store projection", async () => {
  const expected = { campaigns: [{ id: "cause-1" }] };
  const middleware = createImpactMiddleware({ readDashboard: () => expected });
  const res = response();

  await middleware(request("/impact-api/dashboard"), res, () => assert.fail("route should be handled"));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), expected);
  assert.equal(res.headers.get("Cache-Control"), "no-store");
});

test("AG Studio receives only its browser licence", async () => {
  const middleware = createImpactMiddleware(
    { readDashboard: () => ({}) },
    {
      AG_STUDIO_LICENSE_KEY: "[TRIAL]_browser-licence",
      PAYPAL_CLIENT_SECRET: "must-not-leak",
      ASTRO_GATEWAY_API_KEY: "must-not-leak-either",
    },
  );
  const res = response();

  await middleware(request("/impact-api/studio-config"), res, () => assert.fail("route should be handled"));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { licenseKey: "[TRIAL]_browser-licence" });
  assert.doesNotMatch(res.body, /must-not-leak/);
});

test("unknown impact routes fail closed", async () => {
  const middleware = createImpactMiddleware({ readDashboard: () => ({}) });
  const res = response();

  await middleware(request("/impact-api/private-records"), res, () => assert.fail("route should be handled"));

  assert.equal(res.statusCode, 404);
  assert.equal(JSON.parse(res.body).error, "NOT_FOUND");
});

import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { createAiMiddleware } from "../server/ai-api.mjs";
import { createPayPalMiddleware } from "../server/paypal-api.mjs";
import { createFixedWindowRateLimiter, visitorKey } from "../server/rate-limit.mjs";

function mockResponse() {
  return {
    statusCode: 0,
    headers: new Map(),
    body: "",
    setHeader(name, value) { this.headers.set(String(name).toLowerCase(), String(value)); },
    end(body = "") { this.body = String(body); },
  };
}

function mockRequest({ body = {}, ip = "203.0.113.10", method = "POST", url = "/ai-api/impact-match" } = {}) {
  const req = Readable.from([typeof body === "string" ? body : JSON.stringify(body)]);
  req.method = method;
  req.url = url;
  req.headers = { host: "trustpal.example", origin: "https://trustpal.example", "x-forwarded-for": ip };
  req.socket = { remoteAddress: ip };
  return req;
}

async function runMiddleware(middleware, request) {
  const response = mockResponse();
  let passed = false;
  await middleware(request, response, () => { passed = true; });
  return { response, passed, json: response.body ? JSON.parse(response.body) : null };
}

test("AI limiter allows 20 requests per visitor per hour and rejects the 21st", () => {
  let timestamp = 1_000;
  const limiter = createFixedWindowRateLimiter({ limit: 20, windowMs: 3_600_000, now: () => timestamp });
  const request = { headers: { "x-forwarded-for": "203.0.113.10" }, socket: {} };
  for (let index = 0; index < 20; index += 1) {
    assert.equal(limiter(request, mockResponse()), true);
  }
  const blocked = mockResponse();
  assert.equal(limiter(request, blocked), false);
  assert.equal(blocked.headers.get("ratelimit-remaining"), "0");
  assert.ok(Number(blocked.headers.get("retry-after")) > 0);

  assert.equal(limiter({ headers: { "x-forwarded-for": "203.0.113.11" }, socket: {} }, mockResponse()), true);
  timestamp += 3_600_001;
  assert.equal(limiter(request, mockResponse()), true);
});

test("AI middleware enforces the 20-request hourly limit on the endpoint", async () => {
  const middleware = createAiMiddleware({});
  for (let index = 0; index < 20; index += 1) {
    const result = await runMiddleware(middleware, mockRequest({
      body: { prompt: "I can teach English online", mode: "skills" },
      ip: "203.0.113.20",
    }));
    assert.equal(result.response.headers.get("ratelimit-limit"), "20");
    assert.equal(result.response.statusCode, 503);
  }
  const blocked = await runMiddleware(middleware, mockRequest({
    body: { prompt: "I can teach English online", mode: "skills" },
    ip: "203.0.113.20",
  }));
  assert.equal(blocked.response.statusCode, 429);
  assert.equal(blocked.json.error, "RATE_LIMITED");
  assert.equal(blocked.response.headers.get("ratelimit-remaining"), "0");
});

test("visitor rate-limit keys are hashed rather than storing raw addresses", () => {
  const key = visitorKey({ headers: { "x-forwarded-for": "203.0.113.10" }, socket: {} });
  assert.equal(key.length, 64);
  assert.doesNotMatch(key, /203\.0\.113\.10/);
});

test("AI middleware sends bounded output tokens and uses server-published causes", async () => {
  const previousFetch = globalThis.fetch;
  let gatewayRequest;
  globalThis.fetch = async (_url, options) => {
    gatewayRequest = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        choices: [{ message: { tool_calls: [{
          function: {
            name: "TrustPalImpactMatch",
            arguments: JSON.stringify({
              summary: "A safe model-generated recommendation for this contribution.",
              recommendations: [{ causeId: "armenia-learning", reason: "Strong match for the stated contribution.", skillMatch: true, weight: 5 }],
            }),
          },
        }] } }],
      }),
    };
  };
  try {
    const middleware = createAiMiddleware({ ASTRO_GATEWAY_API_KEY: "server-secret", ASTRO_GATEWAY_URL: "https://gateway.example" });
    const result = await runMiddleware(middleware, mockRequest({ body: { prompt: "I can teach English online", mode: "skills" } }));
    assert.equal(result.response.statusCode, 200);
    assert.equal(gatewayRequest.max_completion_tokens, 1_200);
    assert.equal(gatewayRequest.tool_choice, undefined);
    assert.equal(gatewayRequest.tools, undefined);
    assert.match(gatewayRequest.messages[0].content, /JSON Schema/);
    const prompt = JSON.parse(gatewayRequest.messages[1].content);
    assert.ok(prompt.causes.length > 0);
    assert.equal(prompt.causes[0].id, "armenia-learning");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("dashboard analyst accepts plain gateway text and selects inspectable causes", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    json: async () => ({ choices: [{ message: { content: "Four volunteer hours are most useful where deadlines are close and a published skill need is still open." } }] }),
  });
  try {
    const middleware = createAiMiddleware(
      { ASTRO_GATEWAY_API_KEY: "server-secret", ASTRO_GATEWAY_URL: "https://gateway.example" },
      { readDashboard: () => ({ campaigns: [
        { causeId: "education-1", cause: "Rural teaching", category: "Education", fundingPercent: 60, remaining: 500, deadlineDays: 4, skillNeed: "English teaching", volunteerHoursNeeded: 8 },
        { causeId: "park-1", cause: "Park cleanup", category: "Community", fundingPercent: 80, remaining: 200, deadlineDays: 10, skillNeed: "Cleanup", volunteerHoursNeeded: 3 },
      ] }) },
    );
    const result = await runMiddleware(middleware, mockRequest({
      url: "/ai-api/dashboard-insight",
      ip: "203.0.113.56",
      body: { prompt: "Where can four volunteer hours help most?" },
    }));
    assert.equal(result.response.statusCode, 200);
    assert.equal(result.json.source, "model-plus-inspectable-ranking");
    assert.deepEqual(result.json.causeIds, ["education-1", "park-1"]);
    assert.match(result.json.explanation, /volunteer hours/);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("all structured AI flows use gateway-compatible text requests with server validation", async () => {
  const original = globalThis.fetch;
  const cases = [
    ["impact-match", { prompt: "I can teach English online", mode: "skills" }, { summary: "English teaching supports the published rural education need.", recommendations: [{ causeId: "armenia-learning", reason: "English tutoring matches this cause's published skill need.", skillMatch: true, weight: 5 }] }],
    ["skill-evidence", { causeId: "armenia-learning", hours: 2, note: "I can teach English online." }, { contribution: "Online English tutoring", commitment: "Two hours of teaching", evidence: ["Attendance confirmation"], stewardChecklist: ["Confirm attendance", "Review session completion"] }],
    ["cause-draft", { title: "Community education", story: "We will deliver English tutoring for rural children.", goal: 1000, skillNeed: "English tutors" }, { summary: "Deliver accessible English lessons to rural children.", milestones: ["Confirm venue", "Run first lessons", "Report attendance"], budget: [{ label: "Materials", amount: 200 }, { label: "Delivery", amount: 700 }], evidence: ["Attendance report", "Material receipts"], category: "Education", supportType: "Charitable donation" }],
  ];
  try {
    for (const [route, body, output] of cases) {
      globalThis.fetch = async (_url, options) => {
        const payload = JSON.parse(options.body);
        assert.equal(payload.tools, undefined);
        assert.equal(payload.tool_choice, undefined);
        assert.equal(payload.max_completion_tokens, 1200);
        return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(output) } }] }) };
      };
      const middleware = createAiMiddleware({ ASTRO_GATEWAY_API_KEY: "test", ASTRO_GATEWAY_URL: "https://gateway.example" });
      const result = await runMiddleware(middleware, mockRequest({ url: `/ai-api/${route}`, body }));
      assert.equal(result.response.statusCode, 200, route);
      assert.equal(result.json.source, "model");
      if (route === "cause-draft") assert.equal(result.json.budget.reduce((sum, row) => sum + row.amount, 0), 1000);
    }
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"summary":"invalid"}' } }] }) });
    const middleware = createAiMiddleware({ ASTRO_GATEWAY_API_KEY: "test", ASTRO_GATEWAY_URL: "https://gateway.example" });
    const invalidModel = await runMiddleware(middleware, mockRequest({ body: cases[0][1] }));
    assert.equal(invalidModel.response.statusCode, 502);
    assert.equal(invalidModel.json.error, "AI_GENERATION_FAILED");
  } finally { globalThis.fetch = original; }
});

test("AG Studio Agent Framework uses the server-side gateway with bounded output", async () => {
  const previousFetch = globalThis.fetch;
  let gatewayRequest;
  let authorization;
  globalThis.fetch = async (_url, options) => {
    authorization = options.headers.Authorization;
    gatewayRequest = JSON.parse(options.body);
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({
        id: "studio-response",
        model: "gpt-5-6-luna",
        choices: [{ finish_reason: "tool_calls", message: { content: "", tool_calls: [{ id: "call-1", function: { name: "view_schema", arguments: "{}" } }] } }],
        usage: { prompt_tokens: 20, completion_tokens: 8, total_tokens: 28 },
      }),
    };
  };
  try {
    const middleware = createAiMiddleware({ ASTRO_GATEWAY_API_KEY: "server-secret", ASTRO_GATEWAY_URL: "https://gateway.example" });
    const result = await runMiddleware(middleware, mockRequest({
      url: "/ai-api/studio-turn",
      ip: "203.0.113.55",
      body: {
        input: [{ type: "message", role: "user", content: [{ type: "text", text: "Show urgent campaigns" }] }],
        instructions: "Use dashboard tools.",
        tools: [{ name: "view_schema", description: "Inspect the data schema", parameters: { type: "object", properties: {} } }],
        toolChoice: "auto",
        responseFormat: { type: "text" },
      },
    }));
    assert.equal(result.response.statusCode, 200);
    assert.equal(authorization, "Bearer server-secret");
    assert.equal(gatewayRequest.max_completion_tokens, 1_200);
    assert.equal(gatewayRequest.tools[0].function.name, "view_schema");
    assert.equal(result.json.toolCalls[0].name, "view_schema");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("AI middleware rejects oversized and client-injected cause payloads", async () => {
  const middleware = createAiMiddleware({});
  const oversized = await runMiddleware(middleware, mockRequest({ body: `{"prompt":"${"x".repeat(25_000)}","mode":"both"}` }));
  assert.equal(oversized.response.statusCode, 413);

  const injected = await runMiddleware(middleware, mockRequest({ body: { prompt: "Support education", mode: "both", causes: [{ id: "attacker" }] }, ip: "203.0.113.12" }));
  assert.equal(injected.response.statusCode, 400);
});

test("PayPal middleware refuses production configuration and reports Sandbox only", async () => {
  assert.throws(() => createPayPalMiddleware({ PAYPAL_ENVIRONMENT: "live" }), /only supports PayPal Sandbox/);
  const middleware = createPayPalMiddleware({ PAYPAL_ENVIRONMENT: "sandbox" });
  const result = await runMiddleware(middleware, mockRequest({ method: "GET", url: "/paypal-api/health", body: "", ip: "203.0.113.13" }));
  assert.equal(result.response.statusCode, 200);
  assert.equal(result.json.environment, "sandbox");
  assert.equal(result.json.configured, false);
});

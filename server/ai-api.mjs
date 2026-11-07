import crypto from "node:crypto";
import { z } from "zod";
import { causes as publishedCauses } from "../src/data.js";
import { createFixedWindowRateLimiter } from "./rate-limit.mjs";

const DEFAULT_MODEL = "gpt-5-6-terra";
const MAX_BODY_BYTES = 24_000;
const MAX_STUDIO_BODY_BYTES = 256_000;
const MAX_GATEWAY_RETRIES = 2;
const MAX_AI_OUTPUT_TOKENS = 1_200;
const MAX_STUDIO_OUTPUT_TOKENS = 1_200;
const AI_RATE_LIMIT = 20;
const AI_RATE_WINDOW_MS = 60 * 60 * 1000;

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

class GatewayError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readJson(req, maxBytes = MAX_BODY_BYTES) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (Buffer.byteLength(body, "utf8") > maxBytes) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

function studioTextContent(content) {
  if (!Array.isArray(content)) return "";
  return content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n");
}

function studioMessages(input) {
  const messages = [];
  for (const item of input) {
    if (item?.type === "message") {
      const content = studioTextContent(item.content);
      if (content) messages.push({ role: item.role === "assistant" ? "assistant" : item.role === "system" ? "system" : "user", content });
      continue;
    }
    if (item?.type === "function_call" && typeof item.name === "string" && typeof item.callId === "string") {
      messages.push({
        role: "assistant",
        content: null,
        tool_calls: [{
          id: item.callId,
          type: "function",
          function: { name: item.name, arguments: typeof item.arguments === "string" ? item.arguments : "{}" },
        }],
      });
      continue;
    }
    if (item?.type === "function_call_output" && typeof item.callId === "string") {
      messages.push({ role: "tool", tool_call_id: item.callId, content: String(item.output || "") });
    }
  }
  return messages;
}

function normalizeStudioTurn(input) {
  if (!input || typeof input !== "object" || !Array.isArray(input.input) || input.input.length > 80) {
    throw new HttpError(400, "INVALID_STUDIO_REQUEST", "AG Studio supplied an invalid conversation.");
  }
  if (input.tools !== undefined && (!Array.isArray(input.tools) || input.tools.length > 80)) {
    throw new HttpError(400, "INVALID_STUDIO_REQUEST", "AG Studio supplied too many tools.");
  }
  const instructions = String(input.instructions || "");
  if (instructions.length > 80_000) throw new HttpError(400, "INVALID_STUDIO_REQUEST", "AG Studio instructions are too large.");
  const messages = studioMessages(input.input);
  if (!messages.length) throw new HttpError(400, "INVALID_STUDIO_REQUEST", "AG Studio conversation is empty.");
  const tools = (input.tools || []).filter((tool) => tool?.kind !== "provided").map((tool) => {
    const name = String(tool?.name || "");
    const description = String(tool?.description || "");
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(name) || description.length > 2_000 || !tool?.parameters || typeof tool.parameters !== "object") {
      throw new HttpError(400, "INVALID_STUDIO_TOOL", "AG Studio supplied an invalid tool definition.");
    }
    return { type: "function", function: { name, description, parameters: tool.parameters } };
  });
  let toolChoice = input.toolChoice;
  if (toolChoice && typeof toolChoice === "object") toolChoice = { type: "function", function: { name: String(toolChoice.name || "") } };
  if (![undefined, "auto", "none", "required"].includes(toolChoice) && typeof toolChoice !== "object") toolChoice = "auto";
  return { instructions, messages, tools, toolChoice };
}

function requireSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const requestHost = req.headers.host;
  if (!requestHost || new URL(origin).host !== requestHost) {
    throw new HttpError(403, "ORIGIN_NOT_ALLOWED", "Cross-origin AI requests are not allowed.");
  }
}

export function parseStructuredContent(content) {
  if (typeof content !== "string" || !content.trim()) {
    throw new GatewayError(502, "EMPTY_MODEL_RESPONSE", "Astropods returned an empty model response.");
  }
  const withoutFence = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new GatewayError(502, "INVALID_MODEL_JSON", "Astropods did not return a JSON object.");
  }
  try {
    return JSON.parse(withoutFence.slice(start, end + 1));
  } catch {
    throw new GatewayError(502, "INVALID_MODEL_JSON", "Astropods returned invalid JSON.");
  }
}

export function unwrapStructuredContent(value, name) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const wrapped = value[name];
    if (wrapped && typeof wrapped === "object" && !Array.isArray(wrapped)) return wrapped;
  }
  return value;
}

const matchInputSchema = z.object({
  prompt: z.string().trim().min(3).max(600),
  mode: z.enum(["money", "skills", "both"]),
}).strict();

const matchOutputSchema = z.object({
  summary: z.string().min(20).max(500),
  recommendations: z.array(z.object({
    causeId: z.string().min(1).max(100),
    reason: z.string().min(10).max(260),
    skillMatch: z.boolean(),
    weight: z.number().int().min(1).max(5),
  })).min(1).max(3),
});

const skillInputSchema = z.object({
  causeId: z.string().min(1).max(100),
  hours: z.number().int().min(1).max(20),
  note: z.string().trim().min(3).max(600),
}).strict();

const skillOutputSchema = z.object({
  contribution: z.string().min(3).max(160),
  commitment: z.string().min(3).max(160),
  evidence: z.array(z.string().min(3).max(180)).min(1).max(4),
  stewardChecklist: z.array(z.string().min(3).max(180)).min(2).max(5),
});

const causeDraftInputSchema = z.object({
  title: z.string().trim().min(5).max(180),
  story: z.string().trim().min(20).max(1200),
  goal: z.number().min(50).max(100_000),
  skillNeed: z.string().trim().min(3).max(180),
}).strict();

const causeDraftOutputSchema = z.object({
  summary: z.string().min(20).max(500),
  milestones: z.array(z.string().min(3).max(180)).min(3).max(5),
  budget: z.array(z.object({
    label: z.string().min(2).max(100),
    amount: z.number().nonnegative(),
  })).min(2).max(6),
  evidence: z.array(z.string().min(3).max(180)).min(2).max(5),
  category: z.enum(["Education", "Community", "Climate", "Health", "Other"]),
  supportType: z.enum(["Personal education support", "Community project", "Charitable donation", "Personal support"]),
});

const dashboardInsightInputSchema = z.object({
  prompt: z.string().trim().min(3).max(400),
}).strict();

function normalizeBudget(items, goal) {
  const roundedGoal = Number(goal.toFixed(2));
  const safe = items.map((item) => ({ ...item, amount: Math.max(0, Number(item.amount.toFixed(2))) }));
  const usedBeforeLast = safe.slice(0, -1).reduce((sum, item) => sum + item.amount, 0);
  if (usedBeforeLast >= roundedGoal) {
    const share = Number((roundedGoal / safe.length).toFixed(2));
    let used = 0;
    return safe.map((item, index) => {
      const amount = index === safe.length - 1 ? Number((roundedGoal - used).toFixed(2)) : share;
      used += amount;
      return { ...item, amount };
    });
  }
  safe[safe.length - 1].amount = Number((roundedGoal - usedBeforeLast).toFixed(2));
  return safe;
}

function rankDashboardCampaigns(question, campaigns) {
  const query = question.toLowerCase();
  let candidates = campaigns;
  if (/education|study|school|teach|learn/.test(query)) {
    candidates = campaigns.filter((campaign) => campaign.category === "Education" || /education|study|school|teach|learn/.test(`${campaign.cause} ${campaign.skillNeed}`.toLowerCase()));
  } else if (/volunteer|skill|hour|teach|mentor|clean|repair/.test(query)) {
    candidates = campaigns.filter((campaign) => campaign.volunteerHoursNeeded > 0 || campaign.skillNeed);
  }
  if (!candidates.length) candidates = campaigns;
  return [...candidates].sort((a, b) => {
    if (/smallest|close|€|eur|money|fund/.test(query)) return a.remaining - b.remaining || a.deadlineDays - b.deadlineDays;
    return a.deadlineDays - b.deadlineDays || a.fundingPercent - b.fundingPercent || a.remaining - b.remaining;
  }).slice(0, 3);
}

export function createAiMiddleware(env, impactStore) {
  const apiKey = env.ASTRO_GATEWAY_API_KEY;
  const gatewayUrl = String(env.ASTRO_GATEWAY_URL || "").replace(/\/+$/, "");
  // Astropods injects the model selected for the `impact` gateway entry as
  // MODEL_IMPACT. ASTRO_MODEL remains useful for local development and hosts
  // that do not understand the Astropods blueprint model declaration.
  const model = env.MODEL_IMPACT || env.ASTRO_MODEL || DEFAULT_MODEL;
  const configured = Boolean(apiKey && gatewayUrl);
  const enforceRateLimit = createFixedWindowRateLimiter({ limit: AI_RATE_LIMIT, windowMs: AI_RATE_WINDOW_MS });
  const publishedById = new Map(publishedCauses.map((cause) => [cause.id, cause]));

  async function generateStructured({ schema, name, system, prompt }) {
    if (!configured) throw new HttpError(503, "AI_NOT_CONFIGURED", "Astropods AI is not configured; TrustPal will use its transparent rules fallback.");
    const schemaJson = z.toJSONSchema(schema, { target: "draft-7" });
    let lastError;

    for (let attempt = 0; attempt < MAX_GATEWAY_RETRIES; attempt += 1) {
      const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_completion_tokens: MAX_AI_OUTPUT_TOKENS,
          messages: [
            {
              role: "system",
              content: `${system}\nReturn only one JSON object matching this JSON Schema: ${JSON.stringify(schemaJson)}. Do not wrap it in a function name or markdown. Do not add facts that are absent from the supplied data.`,
            },
            { role: "user", content: prompt },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const message = data.choices?.[0]?.message || {};
        const forcedCall = (message.tool_calls || []).find((toolCall) => toolCall?.function?.name === name);
        let parsed;
        if (forcedCall) {
          try {
            parsed = JSON.parse(forcedCall.function.arguments || "{}");
          } catch {
            throw new GatewayError(502, "INVALID_MODEL_JSON", "Astropods returned invalid function arguments.");
          }
        } else {
          // Keep content parsing as a compatibility fallback for gateways that
          // accept a forced tool but still return its JSON as message content.
          parsed = unwrapStructuredContent(parseStructuredContent(message.content), name);
        }
        const validated = schema.safeParse(parsed);
        if (validated.success) return validated.data;
        // Model validation is an upstream failure, never a malformed user request.
        throw new GatewayError(502, "INVALID_MODEL_OUTPUT", "Astropods returned a result outside the required schema.");
      }

      lastError = new GatewayError(
        response.status,
        data.error?.code || "ASTROPODS_GATEWAY_ERROR",
        data.error?.message || `Astropods AI Gateway request failed (${response.status}).`,
      );
      if (attempt + 1 < MAX_GATEWAY_RETRIES && (response.status === 429 || response.status >= 500)) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 2_000) : 350;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      break;
    }
    throw lastError;
  }

  async function generateText({ system, prompt }) {
    if (!configured) throw new HttpError(503, "AI_NOT_CONFIGURED", "Astropods AI is not configured; TrustPal will use its transparent rules fallback.");
    let lastError;
    for (let attempt = 0; attempt < MAX_GATEWAY_RETRIES; attempt += 1) {
      const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          max_completion_tokens: MAX_AI_OUTPUT_TOKENS,
          messages: [{ role: "system", content: system }, { role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        const content = String(data.choices?.[0]?.message?.content || "")
          .replace(/[*_`#]+/g, "")
          .replace(/\s+/g, " ")
          .trim();
        if (content) return content.slice(0, 500);
        throw new GatewayError(502, "EMPTY_MODEL_RESPONSE", "Astropods returned an empty model response.");
      }
      lastError = new GatewayError(response.status, data.error?.code || "ASTROPODS_GATEWAY_ERROR", data.error?.message || `Astropods AI Gateway request failed (${response.status}).`);
      if (attempt + 1 < MAX_GATEWAY_RETRIES && (response.status === 429 || response.status >= 500)) {
        await new Promise((resolve) => setTimeout(resolve, 350));
        continue;
      }
      break;
    }
    throw lastError;
  }

  return async function aiMiddleware(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/ai-api/")) return next();

    try {
      if (req.method === "GET" && url.pathname === "/ai-api/health") {
        return sendJson(res, 200, { configured, provider: "Astropods AI Gateway", model });
      }

      if (req.method !== "POST") {
        return sendJson(res, 405, { error: "METHOD_NOT_ALLOWED", message: "This AI endpoint requires POST." });
      }
      requireSameOrigin(req);
      if (!enforceRateLimit(req, res)) {
        return sendJson(res, 429, { error: "RATE_LIMITED", message: "AI request limit reached. Try again after the current hourly window resets." });
      }

      if (url.pathname === "/ai-api/impact-match") {
        const input = matchInputSchema.parse(await readJson(req));
        const eligibleCauses = publishedCauses.filter((cause) => input.mode === "skills" || cause.recipientReady);
        if (!eligibleCauses.length) throw new HttpError(400, "NO_ELIGIBLE_CAUSES", "No eligible causes match this contribution type.");
        const output = await generateStructured({
          schema: matchOutputSchema,
          name: "TrustPalImpactMatch",
          system: "You are TrustPal's impact-matching agent. Rank only the supplied causes. Prefer a genuine skill fit, urgent deadlines, large funding gaps, and PayPal recipient readiness. Never award Trust Points, make financial promises, or invent facts. Return diverse, concise recommendations that a contributor can inspect and edit.",
          prompt: JSON.stringify({ contribution: input.prompt, mode: input.mode, causes: eligibleCauses }),
        });
        const allowed = new Set(eligibleCauses.map((cause) => cause.id));
        const seen = new Set();
        const recommendations = output.recommendations.filter(({ causeId }) => {
          if (!allowed.has(causeId) || seen.has(causeId)) return false;
          seen.add(causeId);
          return true;
        });
        if (!recommendations.length) throw new HttpError(502, "AI_INVALID_MATCH", "The AI response did not contain a valid cause match.");
        return sendJson(res, 200, { source: "model", model, summary: output.summary, recommendations });
      }

      if (url.pathname === "/ai-api/skill-evidence") {
        const input = skillInputSchema.parse(await readJson(req));
        const cause = publishedById.get(input.causeId);
        if (!cause?.skillNeed) throw new HttpError(404, "CAUSE_NOT_FOUND", "This published cause is unavailable.");
        const output = await generateStructured({
          schema: skillOutputSchema,
          name: "TrustPalSkillEvidence",
          system: "You structure a volunteer's proposed contribution into a clear evidence plan for an approved human steward. Do not claim the work happened, do not award points, and do not change the published point amount. Use only the supplied facts.",
          prompt: JSON.stringify({
            causeTitle: cause.title,
            skillNeed: cause.skillNeed,
            location: cause.location,
            hours: input.hours,
            note: input.note,
          }),
        });
        return sendJson(res, 200, { source: "model", model, ...output });
      }

      if (url.pathname === "/ai-api/cause-draft") {
        const input = causeDraftInputSchema.parse(await readJson(req));
        const output = await generateStructured({
          schema: causeDraftOutputSchema,
          name: "TrustPalCauseDraft",
          system: "You help a Creator Level member structure a donation-funded social cause for human review. Preserve the creator's purpose. Produce measurable milestones, an honest budget that can be normalized to the stated goal, evidence requirements, and a conservative support classification. Never imply equity, repayment, investment return, or guaranteed approval.",
          prompt: JSON.stringify(input),
        });
        return sendJson(res, 200, { source: "model", model, ...output, budget: normalizeBudget(output.budget, input.goal) });
      }

      if (url.pathname === "/ai-api/dashboard-insight") {
        const input = dashboardInsightInputSchema.parse(await readJson(req));
        if (!impactStore) throw new HttpError(503, "IMPACT_DATA_UNAVAILABLE", "Live impact data is unavailable.");
        const dashboard = impactStore.readDashboard();
        const campaigns = dashboard.campaigns.map(({ causeId, cause, category, fundingPercent, remaining, deadlineDays, skillNeed, volunteerHoursNeeded }) => ({
          causeId,
          cause,
          category,
          fundingPercent,
          remaining,
          deadlineDays,
          skillNeed,
          volunteerHoursNeeded,
        }));
        const explanation = await generateText({
          system: "You are TrustPal's read-only Impact Command Center analyst. Answer only from the supplied campaign snapshot in two or three concise sentences. Explain the trade-off between money and volunteer skills. Do not use JSON. Never initiate a payment, award Trust Points, verify a contribution, modify a record, or imply that demo history is real activity.",
          prompt: JSON.stringify({ question: input.prompt, campaigns }),
        });
        const ranked = rankDashboardCampaigns(input.prompt, campaigns);
        const causeIds = ranked.map((campaign) => campaign.causeId);
        const asksForSkills = /volunteer|skill|hour|teach|mentor|clean|repair/.test(input.prompt.toLowerCase());
        return sendJson(res, 200, {
          source: "model-plus-inspectable-ranking",
          model,
          headline: asksForSkills ? "Volunteer time can unlock near-term progress" : "The clearest near-term impact gaps",
          explanation,
          causeIds,
          suggestedAction: `Inspect ${ranked.map((campaign) => campaign.cause).join("; ")} in the campaign grid before choosing where to contribute.`,
          caveat: "The explanation is AI-generated; cause selection uses visible funding, deadline, and skill-need fields.",
        });
      }

      if (url.pathname === "/ai-api/studio-turn") {
        if (!configured) throw new HttpError(503, "AI_NOT_CONFIGURED", "Astropods AI is not configured.");
        const turn = normalizeStudioTurn(await readJson(req, MAX_STUDIO_BODY_BYTES));
        const response = await fetch(`${gatewayUrl}/v1/chat/completions`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_completion_tokens: MAX_STUDIO_OUTPUT_TOKENS,
            messages: [
              {
                role: "system",
                content: "You are operating TrustPal's read-only Impact Command Center. You may inspect supplied data and use AG Studio's client-side tools to create or rearrange analytical widgets. Never initiate or claim a payment, issue Trust Points, verify a contribution, alter a protected record, expose personal data, or present fictional demo history as real activity.",
              },
              ...(turn.instructions ? [{ role: "system", content: turn.instructions }] : []),
              ...turn.messages,
            ],
            ...(turn.tools.length ? { tools: turn.tools, tool_choice: turn.toolChoice || "auto" } : {}),
          }),
          signal: AbortSignal.timeout(30_000),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          console.error("[trustpal-ai] AG Studio turn failed", { status: response.status, code: data.error?.code });
          throw new GatewayError(response.status, data.error?.code || "STUDIO_GATEWAY_ERROR", data.error?.message || "AG Studio AI request failed.");
        }
        const choice = data.choices?.[0];
        const message = choice?.message || {};
        return sendJson(res, 200, {
          id: data.id || crypto.randomUUID(),
          createdAt: Number(data.created || Math.floor(Date.now() / 1000)) * 1000,
          content: typeof message.content === "string" ? message.content : "",
          toolCalls: (message.tool_calls || []).slice(0, 12).map((toolCall) => ({
            id: String(toolCall.id || crypto.randomUUID()),
            name: String(toolCall.function?.name || ""),
            arguments: String(toolCall.function?.arguments || "{}"),
          })),
          status: choice?.finish_reason === "length" ? "incomplete" : "completed",
          model: data.model || model,
          usage: data.usage ? {
            inputTokens: data.usage.prompt_tokens,
            outputTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          } : undefined,
        });
      }

      return sendJson(res, 404, { error: "NOT_FOUND", message: "Unknown AI API route." });
    } catch (error) {
      if (error instanceof z.ZodError) {
        console.error("[trustpal-ai] Invalid request or model output", {
          issues: error.issues.map(({ code, path }) => ({ code, path: path.join(".") })),
        });
        return sendJson(res, 400, { error: "INVALID_INPUT", message: "The AI request contains invalid or incomplete fields." });
      }
      if (error instanceof HttpError) {
        console.error("[trustpal-ai] Request rejected", { status: error.status, code: error.code });
        return sendJson(res, error.status, { error: error.code, message: error.message });
      }
      if (error instanceof GatewayError) {
        console.error("[trustpal-ai] Astropods request failed", { status: error.status, code: error.code });
        return sendJson(res, 502, { error: "AI_GENERATION_FAILED", message: "Astropods AI is temporarily unavailable; TrustPal will use its transparent fallback." });
      }
      console.error("[trustpal-ai] Generation failed", {
        name: error?.name,
        message: error?.message,
        status: error?.statusCode || error?.status,
      });
      return sendJson(res, 502, { error: "AI_GENERATION_FAILED", message: "Live AI is temporarily unavailable; TrustPal will use its transparent fallback." });
    }
  };
}

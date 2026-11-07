import crypto from "node:crypto";
import { createFixedWindowRateLimiter } from "./rate-limit.mjs";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

export function createStewardMiddleware(store, env = {}) {
  const limit = createFixedWindowRateLimiter({ limit: 10, windowMs: 3_600_000 });
  const authorized = (req) => {
    const expected = String(env.STEWARD_ACCESS_TOKEN || "");
    const supplied = String(req.headers?.authorization || "").replace(/^Bearer /, "");
    return expected.length >= 32 && Buffer.byteLength(supplied) === Buffer.byteLength(expected)
      && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  };
  return async (req, res, next) => {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/steward-api/")) return next();
    if (req.method === "GET" && url.pathname === "/steward-api/queue") {
      return send(res, 200, { ...store.readStewardQueue({ privateDetails: authorized(req) }), authenticated: authorized(req), verificationConfigured: String(env.STEWARD_ACCESS_TOKEN || "").length >= 32 });
    }
    const review = url.pathname.match(/^\/steward-api\/offers\/([\w-]+)\/review$/);
    if (req.method !== "POST" || (!review && url.pathname !== "/steward-api/offers")) return send(res, 404, { error: "NOT_FOUND" });
    // Authenticate BEFORE reading or applying any protected decision.
    if (review && !authorized(req)) return send(res, 403, { error: "STEWARD_REQUIRED", message: "Only an approved steward can verify work or issue points." });
    if (req.headers?.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return send(res, 403, { error: "ORIGIN_NOT_ALLOWED" }); }
      catch { return send(res, 403, { error: "ORIGIN_NOT_ALLOWED" }); }
    }
    if (!limit(req, res)) return send(res, 429, { error: "RATE_LIMITED", message: "Review request limit reached. Try again later." });
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (Buffer.byteLength(raw) > 4_000) return send(res, 413, { error: "PAYLOAD_TOO_LARGE" });
      }
      const input = JSON.parse(raw || "{}");
      const result = review ? store.reviewOffer(review[1], input) : store.submitOffer(input);
      return send(res, review ? 200 : 201, result);
    } catch (error) {
      return send(res, error.status || 400, { error: "INVALID_REVIEW", message: error.status ? error.message : "Supply valid review fields." });
    }
  };
}

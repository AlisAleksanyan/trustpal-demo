import crypto from "node:crypto";

const MAX_BUCKETS = 10_000;

function headerValue(headers, name) {
  const value = headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}

export function visitorKey(req) {
  const forwarded = String(headerValue(req.headers, "x-forwarded-for") || "").split(",")[0].trim();
  const address = String(
    headerValue(req.headers, "cf-connecting-ip")
      || headerValue(req.headers, "x-real-ip")
      || forwarded
      || req.socket?.remoteAddress
      || "unknown",
  ).slice(0, 128);
  return crypto.createHash("sha256").update(address).digest("hex");
}

export function createFixedWindowRateLimiter({ limit, windowMs, now = Date.now }) {
  const buckets = new Map();

  function prune(timestamp) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= timestamp) buckets.delete(key);
    }
    while (buckets.size >= MAX_BUCKETS) {
      buckets.delete(buckets.keys().next().value);
    }
  }

  return function enforceRateLimit(req, res) {
    const timestamp = now();
    const key = visitorKey(req);
    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= timestamp) {
      if (buckets.size >= MAX_BUCKETS) prune(timestamp);
      bucket = { count: 0, resetAt: timestamp + windowMs };
      buckets.set(key, bucket);
    }

    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000));
    const remaining = Math.max(0, limit - bucket.count);
    res.setHeader("RateLimit-Policy", `${limit};w=${Math.ceil(windowMs / 1000)}`);
    res.setHeader("RateLimit-Limit", String(limit));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, remaining - 1)));
    res.setHeader("RateLimit-Reset", String(resetSeconds));

    if (bucket.count >= limit) {
      res.setHeader("RateLimit-Remaining", "0");
      res.setHeader("Retry-After", String(resetSeconds));
      return false;
    }

    bucket.count += 1;
    return true;
  };
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

export function createImpactMiddleware(impactStore, env = {}) {
  return async function impactMiddleware(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/impact-api/")) return next();
    if (req.method === "GET" && url.pathname === "/impact-api/dashboard") {
      return sendJson(res, 200, impactStore.readDashboard());
    }
    if (req.method === "GET" && url.pathname === "/impact-api/studio-config") {
      // AG Studio's commercial browser licence is necessarily delivered to the
      // browser. It is not an API credential and grants no server access.
      return sendJson(res, 200, { licenseKey: env.AG_STUDIO_LICENSE_KEY || null });
    }
    return sendJson(res, 404, { error: "NOT_FOUND", message: "Unknown impact API route." });
  };
}

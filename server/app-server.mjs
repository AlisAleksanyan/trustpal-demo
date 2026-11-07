import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createAiMiddleware } from "./ai-api.mjs";
import { createImpactMiddleware } from "./impact-api.mjs";
import { createImpactStore } from "./impact-store.mjs";
import { createPayPalMiddleware } from "./paypal-api.mjs";
import { causes } from "../src/data.js";
import { createStewardMiddleware } from "./steward-api.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(root, "dist", "client");
const port = Number(process.env.PORT || 4173);
const host = process.env.HOST || "0.0.0.0";

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".jpeg", "image/jpeg"],
  [".jpg", "image/jpeg"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function applySecurityHeaders(res) {
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function resolveClientFile(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = path.resolve(clientRoot, `.${decoded}`);
  if (candidate !== clientRoot && !candidate.startsWith(`${clientRoot}${path.sep}`)) return null;
  return candidate;
}

function serveFile(req, res, file) {
  const stats = statSync(file);
  res.statusCode = 200;
  res.setHeader("Content-Type", mimeTypes.get(path.extname(file).toLowerCase()) || "application/octet-stream");
  res.setHeader("Content-Length", stats.size);
  res.setHeader("Cache-Control", file.includes(`${path.sep}assets${path.sep}`) ? "public, max-age=31536000, immutable" : "no-cache");
  if (req.method === "HEAD") return res.end();
  return createReadStream(file).pipe(res);
}

const impactStore = createImpactStore({ causes });
const aiMiddleware = createAiMiddleware(process.env, impactStore);
const impactMiddleware = createImpactMiddleware(impactStore, process.env);
const paypalMiddleware = createPayPalMiddleware(process.env, impactStore);
const stewardMiddleware = createStewardMiddleware(impactStore, process.env);

async function runMiddleware(middleware, req, res) {
  let passed = false;
  await middleware(req, res, () => { passed = true; });
  return passed;
}

const server = createServer(async (req, res) => {
  applySecurityHeaders(res);
  const url = new URL(req.url, "http://localhost");

  try {
    if (url.pathname === "/health") {
      const runtime = process.env.ASTRO_GATEWAY_URL ? "astropods" : process.env.RENDER ? "render" : "node";
      return sendJson(res, 200, { ok: true, service: "trustpal", runtime });
    }
    if (!(await runMiddleware(aiMiddleware, req, res))) return;
    if (!(await runMiddleware(paypalMiddleware, req, res))) return;
    if (!(await runMiddleware(impactMiddleware, req, res))) return;
    if (!(await runMiddleware(stewardMiddleware, req, res))) return;

    if (req.method !== "GET" && req.method !== "HEAD") {
      return sendJson(res, 404, { error: "NOT_FOUND", message: "Unknown route." });
    }
    const requestedFile = resolveClientFile(url.pathname);
    if (requestedFile && existsSync(requestedFile) && statSync(requestedFile).isFile()) {
      return serveFile(req, res, requestedFile);
    }
    const index = path.join(clientRoot, "index.html");
    if (!existsSync(index)) {
      return sendJson(res, 503, { error: "BUILD_MISSING", message: "Run the production build before starting TrustPal." });
    }
    return serveFile(req, res, index);
  } catch (error) {
    console.error("[trustpal-server] Request failed", { path: url.pathname, message: error?.message });
    if (!res.headersSent) return sendJson(res, 500, { error: "INTERNAL_ERROR", message: "TrustPal could not process this request." });
    return res.end();
  }
});

server.listen(port, host, () => {
  console.log(`[trustpal-server] Listening on http://${host}:${port}`);
});

function shutdown(signal) {
  console.log(`[trustpal-server] ${signal} received; closing cleanly.`);
  server.close(() => process.exit(0));
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

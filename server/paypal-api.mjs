import crypto from "node:crypto";
import { causes } from "../src/data.js";
import { createFixedWindowRateLimiter } from "./rate-limit.mjs";

const EUR = "EUR";
const MAX_ALLOCATIONS = 10;
const MAX_TOTAL = 10_000;
const PAYPAL_RATE_LIMIT = 60;
const PAYPAL_RATE_WINDOW_MS = 60 * 60 * 1000;
const PAYPAL_WEBHOOK_RATE_LIMIT = 120;
const SUPPORTED_WEBHOOK_EVENTS = new Set([
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.REFUNDED",
]);
const causeById = new Map(causes.map((cause) => [cause.id, cause]));

class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

class PayPalError extends Error {
  constructor(status, code, message, debugId, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.debugId = debugId;
    this.details = details;
  }
}

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

async function readJson(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 64_000) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Request is too large.");
  }
  try {
    return body ? JSON.parse(body) : {};
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
}

async function readRawJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 128_000) throw new HttpError(413, "PAYLOAD_TOO_LARGE", "Webhook payload is too large.");
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  try {
    return { raw, value: raw ? JSON.parse(raw) : {} };
  } catch {
    throw new HttpError(400, "INVALID_JSON", "Webhook body must be valid JSON.");
  }
}

function requireSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const requestHost = req.headers.host;
  if (!requestHost || new URL(origin).host !== requestHost) {
    throw new HttpError(403, "ORIGIN_NOT_ALLOWED", "Cross-origin payment requests are not allowed.");
  }
}

function validateAllocations(input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > MAX_ALLOCATIONS) {
    throw new HttpError(400, "INVALID_ALLOCATIONS", `Choose between 1 and ${MAX_ALLOCATIONS} causes.`);
  }

  const seen = new Set();
  const allocations = input.map((entry) => {
    const id = String(entry?.id || "");
    const cause = causeById.get(id);
    const amount = Number(entry?.amount);
    if (!cause || !cause.recipientReady || seen.has(id)) {
      throw new HttpError(400, "INVALID_CAUSE", "One or more cause allocations are unavailable.");
    }
    if (!Number.isFinite(amount) || amount < 1 || amount > MAX_TOTAL) {
      throw new HttpError(400, "INVALID_AMOUNT", "Each allocation must be between €1 and €10,000.");
    }
    seen.add(id);
    return { id, cause, amount: Number(amount.toFixed(2)) };
  });

  const total = allocations.reduce((sum, item) => sum + item.amount, 0);
  if (total > MAX_TOTAL) throw new HttpError(400, "TOTAL_TOO_HIGH", "The checkout total cannot exceed €10,000.");
  return { allocations, total: Number(total.toFixed(2)) };
}

function publicError(error) {
  if (error instanceof HttpError) {
    return { status: error.status, payload: { error: error.code, message: error.message } };
  }
  if (error instanceof PayPalError) {
    const declined = error.details?.some((detail) => detail.issue === "INSTRUMENT_DECLINED");
    return {
      status: error.status,
      payload: {
        error: declined ? "INSTRUMENT_DECLINED" : error.code,
        message: declined
          ? "PayPal declined that funding method. Choose another method and try again."
          : "PayPal could not complete this request.",
        debugId: error.debugId,
      },
    };
  }
  console.error("[trustpal-paypal] Unexpected error", { message: error?.message });
  return { status: 500, payload: { error: "INTERNAL_ERROR", message: "Checkout is temporarily unavailable." } };
}

export function createPayPalMiddleware(env, impactStore) {
  const requestedEnvironment = String(env.PAYPAL_ENVIRONMENT || "sandbox").toLowerCase();
  if (requestedEnvironment !== "sandbox") {
    throw new Error("TrustPal's public hackathon demo only supports PayPal Sandbox.");
  }
  const environment = "sandbox";
  const baseUrl = "https://api-m.sandbox.paypal.com";
  const clientId = env.PAYPAL_CLIENT_ID;
  const clientSecret = env.PAYPAL_CLIENT_SECRET;
  const webhookId = env.PAYPAL_WEBHOOK_ID;
  const configured = Boolean(clientId && clientSecret);
  const tokenCache = new Map();
  const orders = new Map();
  const checkoutOrders = new Map();
  const enforceRateLimit = createFixedWindowRateLimiter({ limit: PAYPAL_RATE_LIMIT, windowMs: PAYPAL_RATE_WINDOW_MS });
  const enforceWebhookRateLimit = createFixedWindowRateLimiter({ limit: PAYPAL_WEBHOOK_RATE_LIMIT, windowMs: PAYPAL_RATE_WINDOW_MS });

  async function getToken(kind) {
    if (!configured) throw new HttpError(503, "PAYPAL_NOT_CONFIGURED", "PayPal Sandbox credentials are missing.");
    const cached = tokenCache.get(kind);
    if (cached && Date.now() < cached.expiresAt) return cached.value;

    const isClientToken = kind === "client";
    const body = new URLSearchParams({ grant_type: "client_credentials" });
    if (isClientToken) {
      body.set("response_type", "client_token");
      body.set("intent", "sdk_init");
    }

    const response = await fetch(`${baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "PayPal-Request-Id": crypto.randomUUID(),
      },
      body,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.access_token) {
      const debugId = response.headers.get("paypal-debug-id");
      console.error("[trustpal-paypal] Token request failed", { status: response.status, debugId, name: data.name });
      throw new PayPalError(response.status, "TOKEN_GENERATION_FAILED", "Token request failed", debugId, data.details);
    }
    const expiresIn = Number(data.expires_in || 300);
    tokenCache.set(kind, {
      value: data.access_token,
      expiresAt: Date.now() + Math.max(0, expiresIn - 120) * 1000,
    });
    return data.access_token;
  }

  async function paypalRequest(path, { method = "GET", body, requestId = crypto.randomUUID() } = {}) {
    let accessToken = await getToken("access");
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          ...(method === "POST" ? { "PayPal-Request-Id": requestId } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.status === 401 && attempt < 2) {
        tokenCache.delete("access");
        accessToken = await getToken("access");
        continue;
      }
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const delay = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 250 * (2 ** attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (!response.ok) {
        const debugId = response.headers.get("paypal-debug-id") || data.debug_id;
        console.error("[trustpal-paypal] API request failed", {
          path,
          status: response.status,
          debugId,
          name: data.name,
          issues: data.details?.map((detail) => detail.issue),
        });
        throw new PayPalError(response.status, data.name || "PAYPAL_API_ERROR", data.message, debugId, data.details);
      }
      return data;
    }
    throw new PayPalError(429, "RATE_LIMIT_REACHED", "PayPal rate limit reached");
  }

  function recoverPendingOrder(order) {
    const purchaseUnit = order.purchase_units?.[0];
    if (!order.id || !String(purchaseUnit?.custom_id || "").startsWith("trustpal:")) {
      throw new HttpError(404, "ORDER_NOT_FOUND", "This order was not created by TrustPal.");
    }
    const allocations = (purchaseUnit.items || []).map((item) => {
      const id = String(item.sku || "");
      const cause = causeById.get(id);
      const amount = Number(item.unit_amount?.value);
      if (!cause || !Number.isFinite(amount) || amount < 1) {
        throw new HttpError(409, "ORDER_RECOVERY_FAILED", "The saved order allocations could not be verified.");
      }
      return { id, cause: cause.title, amount: Number(amount.toFixed(2)) };
    });
    if (!allocations.length) throw new HttpError(409, "ORDER_RECOVERY_FAILED", "The saved order has no verified allocations.");
    const pending = {
      allocations,
      captureRequestId: `trustpal-capture-${order.id}`.slice(0, 38),
      captured: order.status === "COMPLETED",
      captureResponse: null,
    };
    orders.set(order.id, pending);
    return pending;
  }

  function captureResponseFromOrder(order, pending) {
    const payment = order.purchase_units?.flatMap((unit) => unit.payments?.captures || [])?.[0];
    if (order.status !== "COMPLETED" || !payment) return null;
    return {
      orderId: order.id,
      status: order.status,
      results: pending.allocations.map((item) => ({
        id: item.id,
        cause: item.cause,
        amount: item.amount,
        currency: payment.amount?.currency_code || EUR,
        status: payment.status || order.status,
        captureId: payment.id || null,
      })),
    };
  }

  return async function paypalMiddleware(req, res, next) {
    const url = new URL(req.url, "http://localhost");
    if (!url.pathname.startsWith("/paypal-api/")) return next();

    try {
      if (req.method === "GET" && url.pathname === "/paypal-api/health") {
        return sendJson(res, 200, {
          configured,
          environment,
          currency: EUR,
          settlementMode: "single-merchant",
          webhookConfigured: Boolean(webhookId),
        });
      }

      if (req.method === "POST" && url.pathname === "/paypal-api/webhooks") {
        if (!enforceWebhookRateLimit(req, res)) {
          return sendJson(res, 429, { error: "RATE_LIMITED", message: "Webhook request limit reached." });
        }
        if (!configured || !webhookId) {
          return sendJson(res, 503, { error: "WEBHOOK_NOT_CONFIGURED", message: "PayPal Sandbox webhook verification is not configured." });
        }
        const { value: event } = await readRawJson(req);
        const verification = await paypalRequest("/v1/notifications/verify-webhook-signature", {
          method: "POST",
          body: {
            auth_algo: req.headers["paypal-auth-algo"],
            cert_url: req.headers["paypal-cert-url"],
            transmission_id: req.headers["paypal-transmission-id"],
            transmission_sig: req.headers["paypal-transmission-sig"],
            transmission_time: req.headers["paypal-transmission-time"],
            webhook_id: webhookId,
            webhook_event: event,
          },
          requestId: `trustpal-webhook-${String(event.id || crypto.randomUUID())}`.slice(0, 38),
        });
        if (verification.verification_status !== "SUCCESS") {
          return sendJson(res, 400, { error: "INVALID_WEBHOOK_SIGNATURE", message: "PayPal webhook signature verification failed." });
        }
        if (SUPPORTED_WEBHOOK_EVENTS.has(event.event_type)) impactStore?.applyWebhook(event);
        return sendJson(res, 200, { received: true });
      }

      if (!enforceRateLimit(req, res)) {
        return sendJson(res, 429, { error: "RATE_LIMITED", message: "PayPal Sandbox request limit reached. Try again after the current hourly window resets." });
      }

      if (req.method === "GET" && url.pathname === "/paypal-api/auth/browser-safe-client-token") {
        const accessToken = await getToken("client");
        return sendJson(res, 200, { accessToken, environment, currency: EUR });
      }

      if (req.method === "POST" && url.pathname === "/paypal-api/checkout/orders/create") {
        requireSameOrigin(req);
        const input = await readJson(req);
        if (input.currency !== EUR) throw new HttpError(400, "INVALID_CURRENCY", "TrustPal Sandbox checkout currently uses EUR.");
        const checkoutId = String(input.checkoutId || "");
        if (!/^[0-9a-f-]{36}$/i.test(checkoutId)) throw new HttpError(400, "INVALID_CHECKOUT_ID", "Checkout identifier is invalid.");
        const existing = checkoutOrders.get(checkoutId);
        if (existing) return sendJson(res, 200, existing);

        const { allocations, total } = validateAllocations(input.allocations);
        const requestId = checkoutId;
        const presentationMode = input.presentationMode === "redirect" ? "redirect" : "auto";
        const origin = req.headers.origin || `https://${req.headers.host}`;
        const redirectUrls = presentationMode === "redirect" ? {
          return_url: new URL("/?paypal=return", origin).toString(),
          cancel_url: new URL("/?paypal=cancel", origin).toString(),
        } : null;
        const payload = {
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: "trustpal-causes",
            custom_id: `trustpal:${checkoutId}`,
            description: "TrustPal cause allocations",
            amount: {
              currency_code: EUR,
              value: total.toFixed(2),
              breakdown: {
                item_total: { currency_code: EUR, value: total.toFixed(2) },
              },
            },
            items: allocations.map(({ id, cause, amount }) => ({
              name: cause.title.slice(0, 127),
              sku: id,
              quantity: "1",
              unit_amount: { currency_code: EUR, value: amount.toFixed(2) },
            })),
          }],
          ...(redirectUrls ? {
            payment_source: {
              paypal: {
                experience_context: {
                  brand_name: "TrustPal",
                  shipping_preference: "NO_SHIPPING",
                  user_action: "PAY_NOW",
                  ...redirectUrls,
                },
              },
            },
          } : {}),
        };
        const order = await paypalRequest("/v2/checkout/orders", { method: "POST", body: payload, requestId });
        const response = { orderId: order.id, status: order.status, total, currency: EUR };
        checkoutOrders.set(checkoutId, response);
        orders.set(order.id, {
          allocations: allocations.map(({ id, cause, amount }) => ({ id, cause: cause.title, amount })),
          captureRequestId: `trustpal-capture-${order.id}`.slice(0, 38),
          captured: false,
          captureResponse: null,
        });
        return sendJson(res, 201, response);
      }

      const orderMatch = url.pathname.match(/^\/paypal-api\/checkout\/orders\/([A-Z0-9]+)$/i);
      if (req.method === "GET" && orderMatch) {
        requireSameOrigin(req);
        const orderId = orderMatch[1];
        const order = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
        const pending = orders.get(orderId) || recoverPendingOrder(order);
        const completed = captureResponseFromOrder(order, pending);
        if (completed) {
          pending.captured = true;
          pending.captureResponse = completed;
          impactStore?.recordCapture(completed);
        }
        return sendJson(res, 200, completed || { orderId: order.id, status: order.status, results: [] });
      }

      const captureMatch = url.pathname.match(/^\/paypal-api\/checkout\/orders\/([A-Z0-9]+)\/capture$/i);
      if (req.method === "POST" && captureMatch) {
        requireSameOrigin(req);
        const orderId = captureMatch[1];
        let pending = orders.get(orderId);
        if (!pending) {
          const order = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}`);
          pending = recoverPendingOrder(order);
          const completed = captureResponseFromOrder(order, pending);
          if (completed) {
            pending.captured = true;
            pending.captureResponse = completed;
            impactStore?.recordCapture(completed);
            return sendJson(res, 200, completed);
          }
        }
        if (pending.captureResponse) return sendJson(res, 200, pending.captureResponse);
        const capture = await paypalRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
          method: "POST",
          body: {},
          requestId: pending.captureRequestId,
        });
        const payment = capture.purchase_units?.[0]?.payments?.captures?.[0];
        const results = pending.allocations.map((item) => ({
          id: item.id,
          cause: item.cause,
          amount: item.amount,
          currency: payment?.amount?.currency_code || EUR,
          status: payment?.status || capture.status,
          captureId: payment?.id || null,
        }));
        pending.captured = capture.status === "COMPLETED";
        pending.captureResponse = { orderId: capture.id, status: capture.status, results };
        impactStore?.recordCapture(pending.captureResponse);
        return sendJson(res, 200, pending.captureResponse);
      }

      return sendJson(res, 404, { error: "NOT_FOUND", message: "Unknown PayPal API route." });
    } catch (error) {
      const { status, payload } = publicError(error);
      return sendJson(res, status, payload);
    }
  };
}

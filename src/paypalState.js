export const PAYPAL_PENDING_KEY = "trustpal.paypal.pending.v1";
const PAYPAL_RETURN_KEYS = ["paypal", "token", "PayerID", "payerId", "ba_token"];

export function readPendingCheckout() {
  try {
    const value = JSON.parse(sessionStorage.getItem(PAYPAL_PENDING_KEY) || "null");
    return value?.checkoutId && Array.isArray(value.allocations) ? value : null;
  } catch {
    return null;
  }
}

export function savePendingCheckout(value) {
  sessionStorage.setItem(PAYPAL_PENDING_KEY, JSON.stringify(value));
}

export function clearPendingCheckout() {
  sessionStorage.removeItem(PAYPAL_PENDING_KEY);
}

export function readPayPalReturnOrderId(search = globalThis.location?.search || "") {
  return new URLSearchParams(search).get("token");
}

export function readPayPalReturnAction(search = globalThis.location?.search || "") {
  return new URLSearchParams(search).get("paypal");
}

export function clearPayPalReturnParams({
  history = globalThis.history,
  location = globalThis.location,
} = {}) {
  if (!history || !location) return false;
  const url = new URL(location.href);
  const changed = PAYPAL_RETURN_KEYS.some((key) => url.searchParams.has(key));
  PAYPAL_RETURN_KEYS.forEach((key) => url.searchParams.delete(key));
  if (changed) history.replaceState(history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return changed;
}

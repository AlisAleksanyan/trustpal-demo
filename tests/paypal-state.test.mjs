import assert from "node:assert/strict";
import test from "node:test";
import { clearPayPalReturnParams, readPayPalReturnAction, readPayPalReturnOrderId } from "../src/paypalState.js";

test("reads the returned PayPal order ID", () => {
  assert.equal(readPayPalReturnOrderId("?token=ORDER123&PayerID=PAYER456"), "ORDER123");
  assert.equal(readPayPalReturnOrderId("?unrelated=value"), null);
});

test("reads the explicit full-page return action", () => {
  assert.equal(readPayPalReturnAction("?paypal=return&token=ORDER123"), "return");
  assert.equal(readPayPalReturnAction("?paypal=cancel"), "cancel");
  assert.equal(readPayPalReturnAction("?token=ORDER123"), null);
});

test("clears only PayPal return parameters", () => {
  let replacement;
  const history = {
    state: { preserved: true },
    replaceState(state, title, url) {
      replacement = { state, title, url };
    },
  };
  const location = {
    href: "http://localhost:4173/discover?paypal=return&token=ORDER123&PayerID=PAYER456&filter=ngo#causes",
  };

  assert.equal(clearPayPalReturnParams({ history, location }), true);
  assert.deepEqual(replacement, {
    state: { preserved: true },
    title: "",
    url: "/discover?filter=ngo#causes",
  });
});

test("does not rewrite a URL without PayPal return parameters", () => {
  let called = false;
  const history = { state: null, replaceState() { called = true; } };
  const location = { href: "http://localhost:4173/?filter=ngo" };

  assert.equal(clearPayPalReturnParams({ history, location }), false);
  assert.equal(called, false);
});

import test from "node:test";
import assert from "node:assert/strict";
import { parseStructuredContent, unwrapStructuredContent } from "../server/ai-api.mjs";

test("parses a plain Astropods JSON response", () => {
  assert.deepEqual(parseStructuredContent('{"summary":"ok"}'), { summary: "ok" });
});

test("parses an Astropods JSON response wrapped in a markdown fence", () => {
  assert.deepEqual(parseStructuredContent('```json\n{"summary":"ok"}\n```'), { summary: "ok" });
});

test("rejects a model response without a JSON object", () => {
  assert.throws(() => parseStructuredContent("I cannot answer that."), /JSON object/);
});

test("unwraps a model-named structured response", () => {
  const wrapped = { TrustPalImpactMatch: { summary: "ok", recommendations: [] } };
  assert.deepEqual(unwrapStructuredContent(wrapped, "TrustPalImpactMatch"), wrapped.TrustPalImpactMatch);
});

test("keeps an already-direct structured response", () => {
  const direct = { summary: "ok", recommendations: [] };
  assert.equal(unwrapStructuredContent(direct, "TrustPalImpactMatch"), direct);
});

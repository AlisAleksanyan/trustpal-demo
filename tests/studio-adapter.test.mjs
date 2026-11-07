import test from "node:test";
import assert from "node:assert/strict";
import { createTrustPalStudioAdapter } from "../src/studioAdapter.js";

test("AG Studio adapter keeps provider credentials server-side and maps tool calls", async () => {
  const previousFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, options) => {
    request = { url, options, body: JSON.parse(options.body) };
    return {
      ok: true,
      json: async () => ({
        id: "response-1",
        createdAt: 1_000,
        content: "I will add a campaign table.",
        toolCalls: [{ id: "call-1", name: "add_widget", arguments: "{\"type\":\"grid\"}" }],
        status: "completed",
        model: "gpt-5-6-luna",
        usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      }),
    };
  };
  try {
    const adapter = createTrustPalStudioAdapter();
    const handler = adapter.executeTurn({ input: [], responseFormat: { type: "text" } });
    const result = await handler.complete;
    assert.equal(request.url, "/ai-api/studio-turn");
    assert.equal(request.options.headers.Authorization, undefined);
    assert.equal(result.output[1].type, "function_call");
    assert.equal(result.output[1].name, "add_widget");
    const events = [];
    for await (const event of handler.stream) events.push(event);
    assert.deepEqual(events.map((event) => event.type), ["TEXT_MESSAGE_CHUNK", "TOOL_CALL_CHUNK"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

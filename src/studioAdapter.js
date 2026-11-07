function createOutput(payload) {
  const output = [];
  if (payload.content) {
    output.push({
      id: `message-${payload.id}`,
      kind: "output",
      type: "message",
      role: "assistant",
      status: payload.status,
      content: [{ type: "text", text: payload.content, annotations: [] }],
    });
  }
  for (const toolCall of payload.toolCalls || []) {
    output.push({
      id: toolCall.id,
      kind: "output",
      type: "function_call",
      callId: toolCall.id,
      name: toolCall.name,
      arguments: toolCall.arguments,
      status: payload.status,
    });
  }
  return output;
}

async function requestTurn(request, signal) {
  const response = await fetch("/ai-api/studio-turn", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || "The AG Studio agent could not complete this turn.");
    error.code = data.error || "STUDIO_AGENT_ERROR";
    throw error;
  }
  return data;
}

export function createTrustPalStudioAdapter() {
  return {
    executeTurn(request, options = {}) {
      const responsePromise = requestTurn(request, options.signal);
      const complete = responsePromise.then((payload) => ({
        id: payload.id,
        createdAt: payload.createdAt,
        output: createOutput(payload),
        status: payload.status,
        ...(payload.status === "incomplete" ? { incompleteDetails: { reason: "max_output_tokens" } } : {}),
        usage: payload.usage,
        model: payload.model,
      }));
      return {
        stream: {
          async *[Symbol.asyncIterator]() {
            const payload = await responsePromise;
            if (payload.content) {
              yield {
                type: "TEXT_MESSAGE_CHUNK",
                messageId: `message-${payload.id}`,
                role: "assistant",
                delta: payload.content,
              };
            }
            for (const toolCall of payload.toolCalls || []) {
              yield {
                type: "TOOL_CALL_CHUNK",
                toolCallId: toolCall.id,
                toolCallName: toolCall.name,
                delta: toolCall.arguments,
              };
            }
          },
        },
        complete,
      };
    },
  };
}

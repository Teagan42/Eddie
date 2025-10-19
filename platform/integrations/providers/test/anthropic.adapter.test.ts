import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamOptions } from "@eddie/types";
import { AnthropicAdapter } from "../src/anthropic";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("undici", () => ({ fetch: fetchMock }));

const createResponse = () => ({
  ok: true,
  status: 200,
  statusText: "OK",
  body: {
    getReader: () => ({
      read: vi.fn().mockResolvedValue({ done: true, value: undefined }),
    }),
  },
});

const createStreamingResponse = (chunks: string[]) => {
  const encoder = new TextEncoder();
  let index = 0;
  const read = vi.fn(async () => {
    if (index >= chunks.length) {
      return { done: true, value: undefined };
    }

    const value = encoder.encode(chunks[index++]);
    return { done: false, value };
  });

  return {
    ok: true,
    status: 200,
    statusText: "OK",
    body: {
      getReader: () => ({ read }),
    },
  };
};

describe("AnthropicAdapter", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("sends tool output schema via response_format", async () => {
    const spawnTool = {
      type: "function" as const,
      name: "spawn_subagent",
      parameters: { type: "object" },
      outputSchema: {
        type: "json_schema",
        name: "eddie.tool.spawn_subagent.result.v1",
        strict: true,
        schema: { type: "object" },
      },
    };

    fetchMock.mockResolvedValueOnce(createResponse());

    const adapter = new AnthropicAdapter({ baseUrl: "https://anthropic.example", apiKey: "ak-test" });
    const iterator = adapter.stream({
      model: "claude-test",
      messages: [],
      tools: [spawnTool as NonNullable<StreamOptions["tools"]>[number]],
    } as StreamOptions);

    for await (const _ of iterator) {
      // exhaust iterator
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] ?? [];
    const body = options?.body ? JSON.parse(options.body as string) : {};
    expect(body.response_format).toEqual(spawnTool.outputSchema);
  });

  it("emits reasoning events for thinking payloads", async () => {
    const chunks = [
      'data: {"type":"thinking","thinking":{"id":"think_1","delta":{"type":"text_delta","text":"Plan"}}}\n\n',
      'data: {"type":"message_delta","delta":{"thinking":{"id":"think_1","type":"thinking_stop","text":"Plan"},"stop_reason":"end"}}\n\n',
      'data: [DONE]\n\n',
    ];

    fetchMock.mockResolvedValueOnce(createStreamingResponse(chunks));

    const adapter = new AnthropicAdapter({ baseUrl: "https://anthropic.example", apiKey: "ak-test" });
    const events: unknown[] = [];
    for await (const event of adapter.stream({ model: "claude-test", messages: [] } as StreamOptions)) {
      events.push(event);
    }

    expect(events).toEqual([
      expect.objectContaining({ type: "reasoning_delta", text: "Plan" }),
      expect.objectContaining({
        type: "reasoning_end",
        metadata: expect.objectContaining({ id: "think_1", text: "Plan" }),
      }),
      expect.objectContaining({ type: "end", reason: "end" }),
      expect.objectContaining({ type: "end" }),
    ]);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamOptions } from "@eddie/types";
import { OpenAICompatibleAdapter } from "../src/openai_compatible";

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

describe("OpenAICompatibleAdapter", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("passes tool output schema via response_format", async () => {
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

    const adapter = new OpenAICompatibleAdapter({ baseUrl: "https://example.com", apiKey: "sk-test" });
    const iterator = adapter.stream({
      model: "gpt-test",
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

  it("normalizes chat history to OpenAI-compatible message schema", async () => {
    fetchMock.mockResolvedValueOnce(createResponse());

    const adapter = new OpenAICompatibleAdapter({
      baseUrl: "https://example.com",
      apiKey: "sk-test",
    });

    const iterator = adapter.stream({
      model: "gpt-test",
      messages: [
        { role: "system", content: "system prompt" },
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi there" },
        {
          role: "assistant",
          content: "",
          name: "math",
          tool_call_id: "call-1",
        },
        {
          role: "tool",
          name: "math",
          tool_call_id: "call-1",
          content: "{\"result\":42}",
        },
      ],
    } as StreamOptions);

    for await (const _ of iterator) {
      // exhaust iterator
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] ?? [];
    const body = options?.body ? JSON.parse(options.body as string) : {};

    expect(body.messages).toEqual([
      {
        role: "system",
        content: [{ type: "text", text: "system prompt" }],
      },
      { role: "user", content: [{ type: "text", text: "hello" }] },
      {
        role: "assistant",
        content: [{ type: "text", text: "hi there" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "" }],
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "math", arguments: "" },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call-1",
        content: "{\"result\":42}",
      },
    ]);
  });

  it("adds empty text segments for blank assistant, system, and user content", async () => {
    fetchMock.mockResolvedValueOnce(createResponse());

    const adapter = new OpenAICompatibleAdapter({
      baseUrl: "https://example.com",
      apiKey: "sk-test",
    });

    const iterator = adapter.stream({
      model: "gpt-test",
      messages: [
        { role: "system", content: "" },
        { role: "user", content: "" },
        { role: "assistant", content: "" },
      ],
    } as StreamOptions);

    for await (const _ of iterator) {
      // exhaust iterator
    }

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] ?? [];
    const body = options?.body ? JSON.parse(options.body as string) : {};

    expect(body.messages).toEqual([
      {
        role: "system",
        content: [{ type: "text", text: "" }],
      },
      {
        role: "user",
        content: [{ type: "text", text: "" }],
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "" }],
      },
    ]);
  });

  it("streams reasoning_content entries as reasoning events", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"reasoning_content":"Plan step"}}]}\n',
      'data: {"choices":[{"delta":{"content":"Final"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1}}\n',
      'data: [DONE]\n',
    ];

    fetchMock.mockResolvedValueOnce(createStreamingResponse(chunks));

    const adapter = new OpenAICompatibleAdapter({ baseUrl: "https://example.com", apiKey: "sk-test" });
    const events: unknown[] = [];
    for await (const event of adapter.stream({ model: "gpt-test", messages: [] } as StreamOptions)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "reasoning_delta", text: "Plan step" },
      { type: "delta", text: "Final" },
      expect.objectContaining({
        type: "reasoning_end",
        metadata: { text: "Plan step" },
      }),
      expect.objectContaining({ type: "end", reason: "stop", usage: { prompt_tokens: 1 } }),
    ]);
  });

  it("streams reasoning entries from delta.reasoning", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"reasoning":{"text":"Plan step"}}}]}\n',
      'data: {"choices":[{"delta":{"content":"Final"},"finish_reason":"stop"}],"usage":{"prompt_tokens":1}}\n',
      'data: [DONE]\n',
    ];

    fetchMock.mockResolvedValueOnce(createStreamingResponse(chunks));

    const adapter = new OpenAICompatibleAdapter({ baseUrl: "https://example.com", apiKey: "sk-test" });
    const events: unknown[] = [];
    for await (const event of adapter.stream({ model: "gpt-test", messages: [] } as StreamOptions)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "reasoning_delta", text: "Plan step" },
      { type: "delta", text: "Final" },
      expect.objectContaining({
        type: "reasoning_end",
        metadata: { text: "Plan step" },
      }),
      expect.objectContaining({ type: "end", reason: "stop", usage: { prompt_tokens: 1 } }),
    ]);
  });

  it("strips <think> blocks from deltas while streaming reasoning events", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"<think>Hidden</think>"}}]}\n',
      'data: {"choices":[{"delta":{"content":"Visible"},"finish_reason":"stop"}]}\n',
      'data: [DONE]\n',
    ];

    fetchMock.mockResolvedValueOnce(createStreamingResponse(chunks));

    const adapter = new OpenAICompatibleAdapter({ baseUrl: "https://example.com", apiKey: "sk-test" });
    const events: unknown[] = [];
    for await (const event of adapter.stream({ model: "gpt-test", messages: [] } as StreamOptions)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "reasoning_delta", text: "Hidden" },
      { type: "delta", text: "Visible" },
      expect.objectContaining({
        type: "reasoning_end",
        metadata: { text: "Hidden" },
      }),
      expect.objectContaining({ type: "end", reason: "stop" }),
    ]);
  });

  it("strips prefixed think tags while capturing reasoning", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"<seed:think>Hidden</seed:think>"}}]}\n',
      'data: {"choices":[{"delta":{"content":"Visible"},"finish_reason":"stop"}]}\n',
      'data: [DONE]\n',
    ];

    fetchMock.mockResolvedValueOnce(createStreamingResponse(chunks));

    const adapter = new OpenAICompatibleAdapter({ baseUrl: "https://example.com", apiKey: "sk-test" });
    const events: unknown[] = [];
    for await (const event of adapter.stream({ model: "gpt-test", messages: [] } as StreamOptions)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "reasoning_delta", text: "Hidden" },
      { type: "delta", text: "Visible" },
      expect.objectContaining({
        type: "reasoning_end",
        metadata: { text: "Hidden" },
      }),
      expect.objectContaining({ type: "end", reason: "stop" }),
    ]);
  });

  it("buffers partial think tags before emitting reasoning and content", async () => {
    const chunks = [
      'data: {"choices":[{"delta":{"content":"<thi"}}]}\n',
      'data: {"choices":[{"delta":{"content":"nk>Hidden</thin"}}]}\n',
      'data: {"choices":[{"delta":{"content":"k>Visible"},"finish_reason":"stop"}]}\n',
      'data: [DONE]\n',
    ];

    fetchMock.mockResolvedValueOnce(createStreamingResponse(chunks));

    const adapter = new OpenAICompatibleAdapter({ baseUrl: "https://example.com", apiKey: "sk-test" });
    const events: unknown[] = [];
    for await (const event of adapter.stream({ model: "gpt-test", messages: [] } as StreamOptions)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "reasoning_delta", text: "Hidden" },
      { type: "delta", text: "Visible" },
      expect.objectContaining({
        type: "reasoning_end",
        metadata: { text: "Hidden" },
      }),
      expect.objectContaining({ type: "end", reason: "stop" }),
    ]);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";
import { OpenAICompatibleAdapter } from "../../../../src/core/providers/openai_compatible";

const encoder = new TextEncoder();
const mocks = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock("undici", () => ({
  fetch: mocks.fetchMock,
}));

describe("OpenAICompatibleAdapter", () => {

  beforeEach(() => {
    mocks.fetchMock.mockReset();
  });

  it("formats tools according to the chat/completions schema", async () => {
    mocks.fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    });

    const adapter = new OpenAICompatibleAdapter({});

    const iterator = adapter.stream({
      model: "test-model",
      messages: [],
      tools: [
        {
          type: "function",
          name: "echo",
          description: "Echo a value",
          parameters: { type: "object" },
        },
      ],
    })[Symbol.asyncIterator]();

    await iterator.next();

    expect(mocks.fetchMock).toHaveBeenCalledTimes(1);
    const [, requestInit] = mocks.fetchMock.mock.calls[0] ?? [];
    expect(requestInit).toBeDefined();
    const body = JSON.parse((requestInit as { body: string }).body);
    expect(body.tools).toEqual([
      {
        type: "function",
        function: {
          name: "echo",
          description: "Echo a value",
          parameters: { type: "object" },
        },
      },
    ]);
  });

  it("emits tool_call events for aggregated tool call fragments", async () => {
    const chunks = [
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  id: "call_123",
                  function: { name: "test_tool", arguments: '{"foo":' },
                },
              ],
            },
          },
        ],
      },
      {
        choices: [
          {
            delta: {
              tool_calls: [
                {
                  index: 0,
                  function: { arguments: '"bar"}' },
                },
              ],
            },
            finish_reason: "tool_calls",
          },
        ],
      },
    ];

    const stream = chunks
      .map((chunk) => `data: ${JSON.stringify(chunk)}\n`)
      .concat("data: [DONE]\n");

    mocks.fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      body: {
        getReader() {
          let index = 0;
          return {
            read: async () => {
              if (index >= stream.length) {
                return { done: true, value: undefined };
              }
              const value = encoder.encode(stream[index++] as string);
              return { done: false, value };
            },
          };
        },
      },
    });

    const adapter = new OpenAICompatibleAdapter({});

    const events: unknown[] = [];
    const streamIterator = adapter.stream({
      model: "test-model",
      messages: [],
    });

    for await (const event of streamIterator) {
      events.push(event);
    }

    expect(events).toHaveLength(2);
    const [toolCall, endEvent] = events as [
      { type: string; id?: string; name?: string; arguments?: unknown; raw?: unknown },
      { type: string }
    ];

    expect(toolCall).toMatchObject({
      type: "tool_call",
      id: "call_123",
      name: "test_tool",
      arguments: { foo: "bar" },
    });
    expect(toolCall.raw).toBe('{"foo":"bar"}');
    expect(endEvent.type).toBe("end");
  });
});


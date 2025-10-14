import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamOptions } from "@eddie/types";
import { OpenAIAdapter } from "../src/openai";

const { streamMock, openAIConstructor } = vi.hoisted(() => {
  const stream = vi.fn();
  const ctor = vi
    .fn()
    .mockImplementation(() => ({ responses: { stream } }));
  return { streamMock: stream, openAIConstructor: ctor };
});

vi.mock("openai", () => ({
  default: openAIConstructor,
}));

type StreamEventLike = Record<string, unknown>;

const createStream = (events: StreamEventLike[], finalResponse: unknown) => ({
  [Symbol.asyncIterator]: () =>
    (async function* () {
      for (const event of events) {
        yield event;
      }
    })(),
  finalResponse: vi.fn().mockResolvedValue(finalResponse),
});

const collectStream = async (
  iterator: AsyncIterable<unknown>,
): Promise<unknown[]> => {
  const collected: unknown[] = [];
  for await (const item of iterator) {
    collected.push(item);
  }
  return collected;
};

const findFunctionCallOutput = (
  payload: unknown,
): { call_id?: string; output?: unknown } | undefined => {
  if (!payload || typeof payload !== "object") {
    return undefined;
  }

  const input = (payload as { input?: unknown }).input;
  if (!Array.isArray(input)) {
    return undefined;
  }

  return input.find(
    (
      item: unknown,
    ): item is { type?: string; call_id?: string; output?: unknown } =>
      typeof item === "object" &&
      item !== null &&
      (item as { type?: unknown }).type === "function_call_output",
  );
};

describe("OpenAIAdapter stream tool calls", () => {
  const options: StreamOptions = { model: "gpt-4o-mini", messages: [] };

  beforeEach(() => {
    streamMock.mockReset();
    openAIConstructor.mockClear();
  });

  it("forwards tool role messages as function_call_output input entries", async () => {
    const spawnResultPayload = JSON.stringify({
      schema: "eddie.tool.spawn_subagent.result.v1",
      content: "Subagent complete",
      data: { summary: "ok" },
      metadata: { agentId: "child-1" },
    });
    const spawnMessage = {
      role: "tool" as const,
      name: "spawn_subagent",
      tool_call_id: "spawn_call",
      content: spawnResultPayload,
    };
    const finalResponse = {
      id: "resp_spawn",
      status: "completed",
      output: [],
    };

    streamMock.mockResolvedValueOnce(createStream([], finalResponse));

    const adapter = new OpenAIAdapter({});
    await collectStream(
      adapter.stream({
        model: "gpt-4o-mini",
        messages: [spawnMessage],
      } as StreamOptions),
    );

    expect(streamMock).toHaveBeenCalledTimes(1);
    const [payload] = streamMock.mock.calls[0] ?? [];
    const functionCallOutput = findFunctionCallOutput(payload);

    expect(functionCallOutput?.call_id).toBe(spawnMessage.tool_call_id);
    expect(functionCallOutput?.output).toBe(spawnResultPayload);
  });

  it("passes previous response id to the OpenAI stream request", async () => {
    const finalResponse = {
      id: "resp_prev",
      status: "completed",
      output: [],
    };
    const events: StreamEventLike[] = [
      { type: "response.created", response: { id: "resp_prev" } },
      { type: "response.completed", response: finalResponse },
    ];

    streamMock.mockResolvedValueOnce(createStream(events, finalResponse));

    const adapter = new OpenAIAdapter({});
    await collectStream(
      adapter.stream({
        model: "gpt-4o-mini",
        messages: [],
        previousResponseId: "resp_prev",
      } as StreamOptions & { previousResponseId: string })
    );

    expect(streamMock).toHaveBeenCalledTimes(1);
    const [payload] = streamMock.mock.calls[0] ?? [];
    expect(payload).toMatchObject({ previous_response_id: "resp_prev" });
  });

  it("emits tool calls using call_id once available and surfaces the response id", async () => {
    const finalResponse = {
      id: "resp_123",
      status: "completed",
      output: [
        {
          type: "function_call",
          id: "fc_1",
          call_id: "call_123",
          name: "bash",
          arguments: '{"command":"ls -l"}',
        },
      ],
    };
    const events: StreamEventLike[] = [
      { type: "response.created", response: { id: "resp_123" } },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { id: "fc_1", type: "function_call", name: "bash" },
      },
      {
        type: "response.function_call_arguments.delta",
        output_index: 0,
        item_id: "fc_1",
        delta: '{"command":"ls -l"}',
      },
      {
        type: "response.function_call_arguments.done",
        output_index: 0,
        item_id: "fc_1",
      },
      {
        type: "response.completed",
        response: finalResponse,
      },
    ];

    streamMock.mockResolvedValueOnce(createStream(events, finalResponse));

    const adapter = new OpenAIAdapter({});
    const results = await collectStream(adapter.stream(options));

    const toolEvents = results.filter(
      (event): event is { type: string; id?: string; name?: string; arguments?: unknown } =>
        typeof event === "object" && event !== null && (event as { type?: unknown }).type === "tool_call",
    );

    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0]?.id).toBe("call_123");
    expect(toolEvents[0]?.name).toBe("bash");
    expect(toolEvents[0]?.arguments).toEqual({ command: "ls -l" });

    const endEvent = results.find(
      (event) => typeof event === "object" && event !== null && (event as { type?: unknown }).type === "end",
    ) as { responseId?: string } | undefined;

    expect(endEvent?.responseId).toBe("resp_123");
  });

  it("buffers tool arguments by output index when identifiers are omitted", async () => {
    const finalResponse = {
      id: "resp_missing",
      status: "completed",
      output: [],
    };
    const events: StreamEventLike[] = [
      { type: "response.created", response: { id: "resp_missing" } },
      {
        type: "response.output_item.added",
        output_index: 0,
        item: { type: "function_call", name: "bash" },
      },
      {
        type: "response.function_call_arguments.delta",
        output_index: 0,
        delta: '{"query":',
      },
      {
        type: "response.function_call_arguments.delta",
        output_index: 0,
        delta: '"status"}',
      },
      {
        type: "response.function_call_arguments.done",
        output_index: 0,
        name: "bash",
        call_id: "call_missing",
      },
      {
        type: "response.completed",
        response: finalResponse,
      },
    ];

    streamMock.mockResolvedValueOnce(createStream(events, finalResponse));

    const adapter = new OpenAIAdapter({});
    const results = await collectStream(adapter.stream(options));

    const toolEvents = results.filter(
      (event): event is { type: string; id?: string; name?: string; arguments?: unknown } =>
        typeof event === "object" && event !== null && (event as { type?: unknown }).type === "tool_call",
    );

    expect(toolEvents).toHaveLength(1);
    expect(toolEvents[0]?.id).toBe("call_missing");
    expect(toolEvents[0]?.name).toBe("bash");
    expect(toolEvents[0]?.arguments).toEqual({ query: "status" });
  });
});

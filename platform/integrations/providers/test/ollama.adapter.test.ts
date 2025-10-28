import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StreamOptions } from "@eddie/types";
import { OllamaAdapter, OllamaAdapterFactory } from "../src/ollama";

const { ollamaConstructor, chatMock, listMock } = vi.hoisted(() => {
  const chat = vi.fn();
  const list = vi.fn();
  const ctor = vi.fn().mockImplementation(() => ({ chat, list }));
  return { ollamaConstructor: ctor, chatMock: chat, listMock: list };
});

vi.mock("ollama", () => ({
  Ollama: ollamaConstructor,
}));

type StreamChunk = Record<string, unknown>;

type AsyncIterableLike<T> = { [Symbol.asyncIterator](): AsyncIterator<T>; };

const createStream = (chunks: StreamChunk[]): AsyncIterableLike<StreamChunk> => ({
  [Symbol.asyncIterator]: () =>
    (async function* () {
      for (const chunk of chunks) {
        yield chunk;
      }
    })(),
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

describe("OllamaAdapter stream", () => {
  const baseOptions: StreamOptions = {
    model: "llama3",
    messages: [
      { role: "system", content: "be concise" },
      { role: "user", content: "Say hello" },
    ],
  };

  beforeEach(() => {
    chatMock.mockReset();
    ollamaConstructor.mockClear();
  });

  it("yields delta and end events from streaming chat responses", async () => {
    const chunks: StreamChunk[] = [
      {
        message: { role: "assistant", content: "Hello" },
        done: false,
      },
      {
        message: { role: "assistant", content: "Hello, world" },
        done: false,
      },
      {
        message: { role: "assistant", content: "Hello, world" },
        done: true,
        done_reason: "stop",
        total_duration: 123,
        eval_count: 5,
        prompt_eval_count: 2,
      },
    ];

    chatMock.mockResolvedValueOnce(createStream(chunks));

    const adapter = new OllamaAdapter({ baseUrl: "http://ollama" });
    const events = await collectStream(
      adapter.stream({ ...baseOptions }),
    );

    expect(chatMock).toHaveBeenCalledTimes(1);
    const [payload] = chatMock.mock.calls[0] ?? [];
    expect(payload).toMatchObject({
      model: baseOptions.model,
      messages: expect.any(Array),
      stream: true,
    });

    expect(events).toEqual([
      { type: "delta", text: "Hello" },
      { type: "delta", text: ", world" },
      {
        type: "end",
        reason: "stop",
        usage: {
          total_duration: 123,
          eval_count: 5,
          prompt_eval_count: 2,
        },
      },
    ]);
  });

  it("emits tool_call events for function invocations", async () => {
    const chunks: StreamChunk[] = [
      {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call-1",
              function: { name: "fetch_weather", arguments: { city: "SF" } },
            },
          ],
        },
        done: false,
      },
      {
        message: { role: "assistant", content: "" },
        done: true,
        done_reason: "tool_calls",
      },
    ];

    chatMock.mockResolvedValueOnce(createStream(chunks));

    const adapter = new OllamaAdapter({ baseUrl: "http://ollama" });
    const events = await collectStream(
      adapter.stream({
        ...baseOptions,
        tools: [
          {
            type: "function",
            name: "fetch_weather",
            description: "Get the current weather",
            parameters: { type: "object" },
          },
        ],
      }),
    );

    expect(events).toEqual([
      {
        type: "tool_call",
        name: "fetch_weather",
        id: "call-1",
        arguments: { city: "SF" },
      },
      { type: "end", reason: "tool_calls" },
    ]);
  });
});

describe("OllamaAdapterFactory", () => {
  beforeEach(() => {
    listMock.mockReset();
    ollamaConstructor.mockClear();
  });

  it("lists available model names via the Ollama client", async () => {
    listMock.mockResolvedValueOnce({
      models: [
        { name: "llama3:8b", size: 1 },
        { name: 42 },
      ],
    });

    const factory = new OllamaAdapterFactory();
    const models = await factory.listModels({
      name: "ollama",
      baseUrl: "http://localhost:11434",
      apiKey: "secret",
    });

    expect(ollamaConstructor).toHaveBeenCalledWith({
      host: "http://localhost:11434",
      headers: {
        Authorization: "Bearer secret",
      },
    });

    expect(listMock).toHaveBeenCalledTimes(1);
    expect(models).toEqual(["llama3:8b"]);
  });
});

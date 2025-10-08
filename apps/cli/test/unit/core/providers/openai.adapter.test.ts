import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIAdapter } from "@eddie/providers";

const streamMock = vi.hoisted(() => vi.fn());

vi.mock("openai", () => {
  class FakeStream implements AsyncIterable<unknown> {
    constructor(
      private readonly events: unknown[] = [],
      private readonly finalPayload: unknown = {
        output: [],
        usage: undefined,
        status: "completed",
      },
    ) {}

    async *[Symbol.asyncIterator](): AsyncIterator<unknown> {
      for (const event of this.events) {
        yield event;
      }
    }

    async finalResponse(): Promise<unknown> {
      return this.finalPayload;
    }
  }

  class FakeOpenAI {
    responses = {
      stream: streamMock,
    };

    constructor(_: unknown) {}
  }

  streamMock.mockImplementation(async () => new FakeStream());

  return { default: FakeOpenAI };
});

describe("OpenAIAdapter", () => {
  beforeEach(() => {
    streamMock.mockClear();
  });

  it("formats tools according to the Responses API schema", async () => {
    const adapter = new OpenAIAdapter({});

    const iterator = adapter.stream({
      model: "gpt-test",
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

    expect(streamMock).toHaveBeenCalledTimes(1);
    const [requestBody] = streamMock.mock.calls[0] ?? [];
    expect(requestBody).toBeDefined();
    expect((requestBody as { tools?: unknown }).tools).toEqual([
      {
        type: "function",
        name: "echo",
        description: "Echo a value",
        parameters: { type: "object" },
        strict: false,
      },
    ]);
  });
});

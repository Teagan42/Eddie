import { beforeEach, describe, expect, it, vi } from "vitest";
import { OpenAIAdapter } from "../../../../src/core/providers/openai";

const mocks = vi.hoisted(() => ({
  fetchMock: vi.fn(),
}));

vi.mock("undici", () => ({
  fetch: mocks.fetchMock,
}));

describe("OpenAIAdapter", () => {
  beforeEach(() => {
    mocks.fetchMock.mockReset();
  });

  it("formats tools according to the chat/completions schema", async () => {
    mocks.fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
    });

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
});

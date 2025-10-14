import { describe, expect, it, vi } from "vitest";
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
});

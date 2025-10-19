import { describe, expect, it, vi } from "vitest";
import { ReadableStream } from "node:stream/web";
import type { StreamOptions } from "@eddie/types";
import { LocalDockerModelRunnerAdapter } from "../src/local_docker";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("undici", () => ({ fetch: fetchMock }));

const createStream = (chunks: string[]): ReadableStream<Uint8Array> => {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
};

describe("LocalDockerModelRunnerAdapter", () => {
  it("streams delta and end events from the runner SSE response", async () => {
    const chunks = [
      'data: {"type":"response.created","response":{"id":"resp_1"}}\n\n',
      'data: {"type":"response.output_text.delta","delta":"hello"}\n',
      'data: {"type":"response.completed","response":{"id":"resp_1","status":"completed","usage":{"input":1}}}\n\n',
    ];

    fetchMock.mockResolvedValueOnce({
      ok: true,
      body: createStream(chunks),
    });

    const adapter = new LocalDockerModelRunnerAdapter({
      baseUrl: "http://127.0.0.1:8000",
    });

    const events: unknown[] = [];
    for await (const event of adapter.stream({
      model: "local-model",
      messages: [],
    } as StreamOptions)) {
      events.push(event);
    }

    expect(events).toEqual([
      { type: "delta", text: "hello" },
      {
        type: "end",
        reason: "completed",
        responseId: "resp_1",
        usage: { input: 1 },
      },
    ]);
  });
});

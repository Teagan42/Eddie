import { describe, expect, it, vi } from "vitest";

type JsonlWriterServiceModule = typeof import("../src/jsonl-writer.service");

describe("JsonlWriterService", () => {
  it("notifies listeners when writing events", async () => {
    const appendFile = vi.fn();
    const writeFile = vi.fn();
    const mkdir = vi.fn();

    vi.doMock("fs/promises", () => ({
      default: { appendFile, writeFile, mkdir },
      appendFile,
      writeFile,
      mkdir,
    }));

    const { JsonlWriterService }: JsonlWriterServiceModule = await import(
      "../src/jsonl-writer.service"
    );

    const service = new JsonlWriterService();
    const listener = vi.fn();
    const unregister = service.registerListener(listener);

    await service.write("/tmp/trace.jsonl", { phase: "start" }, true);

    expect(mkdir).toHaveBeenCalled();
    expect(appendFile).toHaveBeenCalledWith(
      "/tmp/trace.jsonl",
      `${JSON.stringify({ phase: "start" })}\n`,
      "utf-8"
    );
    expect(listener).toHaveBeenCalledWith({
      filePath: "/tmp/trace.jsonl",
      event: { phase: "start" },
      append: true,
    });

    unregister();

    vi.resetModules();
  });
});

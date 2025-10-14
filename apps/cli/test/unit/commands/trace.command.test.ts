import fs from "fs/promises";
import path from "path";
import os from "os";
import { describe, it, expect, vi, afterEach } from "vitest";
import { TraceCommand } from "../../../src/cli/commands/trace.command";
import { createBaseConfig } from "./config.fixture";

const streamMocks = vi.hoisted(() => {
  const store: {
    actual?: typeof import("node:fs");
    createReadStream: ReturnType<typeof vi.fn>;
  } = {
    createReadStream: vi.fn((...args: any[]) =>
      store.actual!.createReadStream(...(args as [any, any?]))
    ),
  };
  return store;
});

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  streamMocks.actual = actual;
  return {
    ...actual,
    createReadStream: streamMocks.createReadStream,
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  streamMocks.createReadStream.mockReset();
});

describe("TraceCommand", () => {
  it("does not declare a ConfigService dependency", () => {
    expect(TraceCommand.length).toBe(2);
  });

  it("does not reload configuration before printing traces", async () => {
    const optionsService = { parse: vi.fn(() => ({ provider: "override" })) };
    const config = createBaseConfig();
    config.output = { jsonlTrace: "./trace.jsonl", jsonlAppend: true };
    const configStore = { getSnapshot: vi.fn(() => config) };
    const command = new TraceCommand(
      optionsService as any,
      configStore as any,
    );

    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("missing"));
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await command.execute({ options: {} } as any);

    expect(configStore.getSnapshot).toHaveBeenCalledTimes(1);
  });

  it("streams the last 50 trace records without loading entire file", async () => {
    const optionsService = { parse: vi.fn(() => ({})) };
    const config = createBaseConfig();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "trace-command-"));
    const tracePath = path.join(tmpDir, "trace.jsonl");
    config.output = { jsonlTrace: tracePath, jsonlAppend: true };
    const configStore = { getSnapshot: vi.fn(() => config) };
    const command = new TraceCommand(
      optionsService as any,
      configStore as any,
    );

    const lines = Array.from({ length: 60 }, (_, index) =>
      JSON.stringify({ index })
    );
    await fs.writeFile(tracePath, `${lines.join("\n")}\n`, "utf-8");

    const readFileSpy = vi
      .spyOn(fs, "readFile")
      .mockRejectedValue(new Error("should not be called"));
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    try {
      await command.execute({ options: {} } as any);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }

    expect(readFileSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledTimes(50);
    const firstCall = logSpy.mock.calls[0]?.[0];
    const lastCall = logSpy.mock.calls.at(-1)?.[0];
    expect(firstCall).toContain("\"index\": 10");
    expect(lastCall).toContain("\"index\": 59");
  });

  it("limits trace stream chunk size to avoid large buffers", async () => {
    const optionsService = { parse: vi.fn(() => ({})) };
    const config = createBaseConfig();
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "trace-command-"));
    const tracePath = path.join(tmpDir, "trace.jsonl");
    config.output = { jsonlTrace: tracePath, jsonlAppend: true };
    const configStore = { getSnapshot: vi.fn(() => config) };
    const command = new TraceCommand(
      optionsService as any,
      configStore as any,
    );

    await fs.writeFile(tracePath, `${JSON.stringify({ ok: true })}\n`, "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    try {
      await command.execute({ options: {} } as any);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }

    expect(streamMocks.createReadStream).toHaveBeenCalledWith(
      tracePath,
      expect.objectContaining({
        encoding: "utf-8",
        highWaterMark: 64 * 1024,
      })
    );
    expect(logSpy).toHaveBeenCalledTimes(1);
  });
});

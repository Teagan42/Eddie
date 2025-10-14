import fs from "fs/promises";
import { Readable } from "stream";
import { describe, it, expect, vi, afterEach } from "vitest";
import { TraceCommand } from "../../../src/cli/commands/trace.command";
import { createBaseConfig } from "./config.fixture";

afterEach(() => {
  vi.restoreAllMocks();
  fsStreamMocks.createReadStream.mockReset();
});

const fsStreamMocks = vi.hoisted(() => ({
  createReadStream: vi.fn(),
}));

vi.mock("fs", () => ({
  createReadStream: fsStreamMocks.createReadStream,
}));

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

  it("streams trace entries when direct read fails", async () => {
    const optionsService = { parse: vi.fn(() => ({ provider: "override" })) };
    const config = createBaseConfig();
    config.output = { jsonlTrace: "./trace.jsonl" };
    const configStore = { getSnapshot: vi.fn(() => config) };
    const command = new TraceCommand(
      optionsService as any,
      configStore as any,
    );

    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("too large"));
    fsStreamMocks.createReadStream.mockReturnValueOnce(
      Readable.from([
        "{\"event\":1}\n",
        "{\"event\":2}\n",
      ], { encoding: "utf-8" })
    );

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(
      () => undefined
    );

    await command.execute({ options: {} } as any);

    expect(fsStreamMocks.createReadStream).toHaveBeenCalledWith(
      expect.stringContaining("trace.jsonl"),
      expect.objectContaining({ encoding: "utf-8" })
    );
    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("event"));
  });
});

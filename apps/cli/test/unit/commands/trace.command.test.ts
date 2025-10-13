import fs from "fs/promises";
import { describe, it, expect, vi, afterEach } from "vitest";
import { TraceCommand } from "../../../src/cli/commands/trace.command";
import { createBaseConfig } from "./config.fixture";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("TraceCommand", () => {
  it("does not reload configuration before printing traces", async () => {
    const optionsService = { parse: vi.fn(() => ({ provider: "override" })) };
    const configService = { load: vi.fn() };
    const config = createBaseConfig();
    config.output = { jsonlTrace: "./trace.jsonl", jsonlAppend: true };
    const configStore = { getSnapshot: vi.fn(() => config) };
    const command = new TraceCommand(
      optionsService as any,
      configService as any,
      configStore as any,
    );

    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("missing"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await command.execute({ options: {} } as any);

    expect(configService.load).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });
});

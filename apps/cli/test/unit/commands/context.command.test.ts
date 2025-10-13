import { describe, it, expect, vi, afterEach } from "vitest";
import { ContextCommand } from "../../../src/cli/commands/context.command";
import { createBaseConfig } from "./config.fixture";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ContextCommand", () => {
  it("does not declare a ConfigService dependency", () => {
    expect(ContextCommand.length).toBe(5);
  });

  it("does not reload configuration before previewing context", async () => {
    const optionsService = { parse: vi.fn(() => ({ provider: "override" })) };
    const configStore = { getSnapshot: vi.fn(() => createBaseConfig()) };
    const logger = { debug: vi.fn() };
    const loggerService = {
      configure: vi.fn(),
      getLogger: vi.fn(() => logger),
    };
    const contextService = {
      pack: vi.fn(async () => ({
        files: [ { path: "a.txt", bytes: 4 } ],
        totalBytes: 4,
        text: "text",
        resources: [],
      })),
    };
    const tokenizerService = {
      create: vi.fn(() => ({ countTokens: vi.fn(() => 1) })),
    };
    const command = new ContextCommand(
      optionsService as any,
      configStore as any,
      loggerService as any,
      contextService as any,
      tokenizerService as any,
    );

    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await command.execute({ options: {} } as any);

    expect(configStore.getSnapshot).toHaveBeenCalledTimes(1);
  });
});

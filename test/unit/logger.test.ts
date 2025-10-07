import { describe, it, expect, afterEach } from "vitest";
import fs from "fs/promises";
import path from "path";
import { getLogger, initLogging, resetLogging } from "../../src/io/logger";

afterEach(async () => {
  resetLogging();
  const tmpDir = path.join(process.cwd(), "test-logs");
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe("logging framework", () => {
  it("writes logs to a configured file destination", async () => {
    const logPath = path.join(process.cwd(), "test-logs", "eddie.log");

    initLogging({
      level: "info",
      destination: {
        type: "file",
        path: logPath,
      },
    });

    const logger = getLogger("test");
    logger.info({ check: true }, "file logging works");

    await new Promise((resolve) => setTimeout(resolve, 50));

    const content = await fs.readFile(logPath, "utf-8");
    expect(content).toContain("file logging works");
  });

  it("returns scoped child loggers", () => {
    initLogging({ level: "info" });
    const logger = getLogger("engine");
    const child = logger.child({ requestId: "123" });
    expect(child.bindings()).toMatchObject({ scope: "engine", requestId: "123" });
  });
});

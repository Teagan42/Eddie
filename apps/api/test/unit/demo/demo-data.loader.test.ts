import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { afterEach, describe, expect, it } from "vitest";

import { loadDemoData } from "../../../src/demo/demo-data.loader";

const tempDirs: string[] = [];

const createFixtureFile = (data: unknown): string => {
  const dir = mkdtempSync(join(tmpdir(), "eddie-demo-data-"));
  tempDirs.push(dir);
  const file = join(dir, "fixture.json");
  writeFileSync(file, JSON.stringify(data), "utf8");
  return file;
};

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("loadDemoData", () => {
  it("returns parsed demo data when the payload is valid", async () => {
    const validFixture = {
      sessions: [
        {
          id: "session-1",
          title: "Demo Session",
          description: "Example session",
          status: "active",
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-01T00:05:00.000Z",
        },
      ],
      messages: [
        {
          id: "message-1",
          sessionId: "session-1",
          role: "user",
          content: "Hello, world!",
          createdAt: "2024-01-01T00:01:00.000Z",
        },
      ],
      traces: [
        {
          id: "trace-1",
          sessionId: "session-1",
          name: "Demo trace",
          status: "completed",
          durationMs: 1234,
          createdAt: "2024-01-01T00:02:00.000Z",
          updatedAt: "2024-01-01T00:03:00.000Z",
          metadata: { foo: "bar" },
        },
      ],
      logs: [
        {
          id: "log-1",
          level: "info",
          message: "Demo log entry",
          context: { requestId: "req-1" },
          createdAt: "2024-01-01T00:04:00.000Z",
        },
      ],
    } as const;

    const path = createFixtureFile(validFixture);
    const result = await loadDemoData(path);

    expect(result).toEqual(validFixture);
  });

  it("throws a descriptive error when the payload is invalid", async () => {
    const invalidFixture = {
      sessions: [
        {
          id: "session-1",
          title: "Broken Session",
          status: "active",
          createdAt: "not-a-date",
          updatedAt: "2024-01-01T00:05:00.000Z",
        },
      ],
      messages: [],
      traces: [],
      logs: [],
    };

    const path = createFixtureFile(invalidFixture);

    await expect(loadDemoData(path)).rejects.toThrow(
      /sessions\[0\]\.createdAt/i,
    );
  });
});

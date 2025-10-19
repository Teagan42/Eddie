import { describe, expect, it } from "vitest";
import { resolve, join } from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  loadDemoSessionsFixture,
  loadDemoLogsFixture,
  loadDemoTracesFixture,
} from "../../../src/demo/demo-data.loader";

const fixturesDir = resolve(
  __dirname,
  "../../../../../examples/demo-agent-screenshots/data"
);

async function withTempFixture(
  prefix: string,
  filename: string,
  data: unknown,
  assertion: (filePath: string) => Promise<void>
): Promise<void> {
  const tempDir = await mkdtemp(join(tmpdir(), prefix));
  const tempPath = join(tempDir, filename);
  await writeFile(tempPath, JSON.stringify(data), "utf-8");

  try {
    await assertion(tempPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

describe("demo data loader", () => {
  it("loads sessions with messages and invocation tree from fixture", async () => {
    const result = await loadDemoSessionsFixture(resolve(fixturesDir, "chat-sessions.json"));

    expect(result.sessions).toHaveLength(1);
    const [session] = result.sessions;

    expect(session).toMatchObject({
      id: "demo-screenshot",
      title: "Web walkthrough",
      createdAt: "2024-09-01T12:00:00Z",
    });

    expect(session.messages).toHaveLength(3);
    expect(session.messages[0]).toMatchObject({
      id: "msg-001",
      role: "user",
      content: "Show me how Eddie renders the trace timeline.",
    });

    expect(session.agentInvocationTree).toMatchObject({
      id: "root",
      agent: "demo-web",
      status: "succeeded",
    });
  });

  it("loads traces events with timestamps from fixture", async () => {
    const result = await loadDemoTracesFixture(resolve(fixturesDir, "traces.json"));

    expect(result.events).toHaveLength(3);
    expect(result.events[0]).toMatchObject({
      id: "evt-plan-accepted",
      type: "agent.plan.accepted",
      timestamp: "2024-09-01T12:00:02Z",
      payload: {
        agent: "planner",
        plan: ["Collect repository overview", "Capture trace timeline callouts"],
      },
    });
  });

  it("loads log entries with context from fixture", async () => {
    const result = await loadDemoLogsFixture(resolve(fixturesDir, "logs.json"));

    expect(result.entries).toHaveLength(3);
    expect(result.entries[0]).toMatchObject({
      timestamp: "2024-09-01T12:00:01Z",
      level: "info",
      message: "Seeded planner output for screenshot mode.",
      context: {
        module: "demo-web",
        component: "planner",
      },
    });
  });

  it("rejects invalid session fixtures with descriptive errors", async () => {
    await withTempFixture(
      "demo-sessions-",
      "sessions.json",
      { sessions: [{ id: 1 }] },
      async (tempPath) => {
        await expect(loadDemoSessionsFixture(tempPath)).rejects.toThrow(
          /invalid demo sessions fixture/i
        );
      }
    );
  });

  it("rejects invalid trace fixtures with descriptive errors", async () => {
    await withTempFixture(
      "demo-traces-",
      "traces.json",
      { events: [{ id: "evt", type: "event" }] },
      async (tempPath) => {
        await expect(loadDemoTracesFixture(tempPath)).rejects.toThrow(
          /invalid demo traces fixture.*events\[0\]\.timestamp/i
        );
      }
    );
  });

  it("rejects invalid log fixtures with descriptive errors", async () => {
    await withTempFixture(
      "demo-logs-",
      "logs.json",
      { entries: [{ level: "info" }] },
      async (tempPath) => {
        await expect(loadDemoLogsFixture(tempPath)).rejects.toThrow(
          /invalid demo logs fixture.*entries\[0\]\.timestamp.*entries\[0\]\.message/i
        );
      }
    );
  });
});

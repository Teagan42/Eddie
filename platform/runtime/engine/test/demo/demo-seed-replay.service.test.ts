import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { EddieConfig } from "@eddie/types";
import { DemoSeedReplayService } from "../../src/demo/demo-seed-replay.service";

const logger = {
  info: vi.fn(),
  debug: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

afterEach(() => {
  vi.restoreAllMocks();
  logger.info.mockReset();
  logger.debug.mockReset();
  logger.warn.mockReset();
  logger.error.mockReset();
});

describe("DemoSeedReplayService", () => {
  it("returns undefined when config omits demo seeds", async () => {
    const service = new DemoSeedReplayService();
    const config: EddieConfig = {
      model: "model",
      provider: { name: "noop" },
      projectDir: process.cwd(),
      context: { include: [] },
      api: undefined,
      systemPrompt: "You are Eddie.",
      logLevel: "info",
      logging: { level: "info" },
      output: {},
      tools: { enabled: [], autoApprove: false },
      hooks: {},
      tokenizer: { provider: "noop" },
      agents: {
        mode: "single",
        manager: { prompt: "You are Eddie." },
        subagents: [],
        enableSubagents: false,
      },
      transcript: {},
    } as EddieConfig;

    const replay = await service.replayIfEnabled({
      config,
      prompt: "prompt",
      projectDir: config.projectDir,
      logger,
    });

    expect(replay).toBeUndefined();
  });

  it("loads demo seeds and writes traces", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-demo-"));
    const projectDir = tmpDir;
    const config: EddieConfig = {
      model: "model",
      provider: { name: "noop" },
      projectDir,
      context: { include: [] },
      api: undefined,
      systemPrompt: "You are Eddie.",
      logLevel: "info",
      logging: { level: "info" },
      output: {},
      tools: { enabled: [], autoApprove: false },
      hooks: {},
      tokenizer: { provider: "noop" },
      agents: {
        mode: "single",
        manager: { prompt: "You are Eddie." },
        subagents: [],
        enableSubagents: false,
      },
      transcript: {},
      demoSeeds: {
        chatSessions: "chat.json",
        logs: "logs.json",
        traces: "traces.json",
        runtimeConfig: "runtime.json",
      },
    } as EddieConfig;

    await fs.writeFile(
      path.join(projectDir, "chat.json"),
      JSON.stringify({
        sessions: [
          {
            messages: [
              { role: "user", content: "hi" },
              { role: "assistant", content: "hello" },
            ],
          },
        ],
      }),
      "utf-8"
    );

    await fs.writeFile(
      path.join(projectDir, "logs.json"),
      JSON.stringify({
        entries: [
          { level: "info", message: "log entry" },
        ],
      }),
      "utf-8"
    );

    await fs.writeFile(
      path.join(projectDir, "traces.json"),
      JSON.stringify({ events: [ { type: "demo" } ] }),
      "utf-8"
    );

    await fs.writeFile(
      path.join(projectDir, "runtime.json"),
      JSON.stringify({ runtime: { preset: "demo" } }),
      "utf-8"
    );

    const service = new DemoSeedReplayService();
    const replay = await service.replayIfEnabled({
      config,
      prompt: "prompt",
      projectDir,
      logger,
      tracePath: "trace/output.jsonl",
    });

    expect(replay).toBeDefined();
    expect(replay?.messages).toHaveLength(3);
    expect(replay?.assistantMessages).toBe(1);
    expect(replay?.tracePath).toBe(path.resolve(projectDir, "trace/output.jsonl"));
    expect(logger.info).toHaveBeenCalledWith(
      { demoRuntime: { preset: "demo" } },
      "Loaded demo runtime metadata"
    );

    const traceContents = await fs.readFile(replay!.tracePath!, "utf-8");
    expect(traceContents.trim()).toBe(JSON.stringify({ type: "demo" }));

    await fs.rm(tmpDir, { recursive: true, force: true });
  });
});

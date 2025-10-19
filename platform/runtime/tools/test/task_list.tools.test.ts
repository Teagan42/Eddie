import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { builtinTools } from "../src/builtin/builtin-tools";

const findTool = (name: string) =>
  builtinTools.find((candidate) => candidate.name === name);

describe("task list tools", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "task-list-tools-"));
  });

  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("creates a task list file with metadata when confirmed", async () => {
    const tool = findTool("agent__new_task_list");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("agent__new_task_list tool not registered");
    }

    const ctx = {
      cwd: workspace,
      confirm: vi.fn(async () => true),
    };

    const result = await tool.handler(
      {
        taskListName: "daily",
        metadata: { owner: "agent" },
      },
      ctx,
    );

    expect(ctx.confirm).toHaveBeenCalledWith('Create new task list "daily"?');
    expect(result.schema).toBe("eddie.tool.task_list.result.v1");
    expect(result.data.tasks).toEqual([]);
    expect(result.data.metadata).toEqual({ owner: "agent" });
    expect(typeof result.data.createdAt).toBe("string");
    expect(typeof result.data.updatedAt).toBe("string");

    const stored = await fs.readFile(
      path.join(workspace, ".tasks", "daily.json"),
      "utf-8",
    );
    const parsed = JSON.parse(stored);

    expect(parsed.tasks).toEqual([]);
    expect(parsed.metadata).toEqual({ owner: "agent" });
    expect(typeof parsed.createdAt).toBe("string");
    expect(typeof parsed.updatedAt).toBe("string");
  });

  it("skips file creation when confirmation is declined", async () => {
    const tool = findTool("agent__new_task_list");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("agent__new_task_list tool not registered");
    }

    const ctx = {
      cwd: workspace,
      confirm: vi.fn(async () => false),
    };

    const result = await tool.handler(
      {
        taskListName: "weekly",
      },
      ctx,
    );

    expect(ctx.confirm).toHaveBeenCalledWith('Create new task list "weekly"?');
    await expect(
      fs.readFile(path.join(workspace, ".tasks", "weekly.json"), "utf-8"),
    ).rejects.toMatchObject({ code: "ENOENT" });
    expect(result.content).toMatch(/cancelled/i);
  });

  it("throws when the task list name is invalid", async () => {
    const tool = findTool("agent__new_task_list");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("agent__new_task_list tool not registered");
    }

    const ctx = {
      cwd: workspace,
      confirm: vi.fn(async () => true),
    };

    await expect(
      tool.handler(
        {
          taskListName: "invalid/name",
        },
        ctx,
      ),
    ).rejects.toThrow(/task list name/i);
    expect(ctx.confirm).not.toHaveBeenCalled();
  });
});

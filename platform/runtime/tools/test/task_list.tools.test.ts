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

  it("adds tasks with insertion hints, metadata, and confirmation", async () => {
    const tool = findTool("agent__new_task");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("agent__new_task tool not registered");
    }

    await fs.mkdir(path.join(workspace, ".tasks"), { recursive: true });
    await fs.writeFile(
      path.join(workspace, ".tasks", "daily.json"),
      `${JSON.stringify(
        {
          metadata: { owner: "agent" },
          tasks: [
            {
              id: "alpha",
              title: "Existing first task",
              status: "pending",
              summary: "Initial",
              details: null,
              metadata: { priority: "medium" },
              createdAt: "2024-01-01T00:00:00.000Z",
              updatedAt: "2024-01-01T00:00:00.000Z",
            },
            {
              id: "omega",
              title: "Existing final task",
              status: "in_progress",
              summary: null,
              details: "Wrap up work",
              metadata: { priority: "low" },
              createdAt: "2024-01-02T00:00:00.000Z",
              updatedAt: "2024-01-02T00:00:00.000Z",
            },
          ],
          createdAt: "2024-01-01T00:00:00.000Z",
          updatedAt: "2024-01-02T00:00:00.000Z",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const confirm = vi.fn().mockResolvedValue(true);
    const ctx = { cwd: workspace, confirm };

    const firstResult = await tool.handler(
      {
        taskListName: "daily",
        title: "Write tests",
        summary: "Add coverage",
        details: "Ensure the new task tool is verified",
        metadata: { priority: "high" },
        beforeTaskId: "omega",
      },
      ctx,
    );

    expect(confirm).toHaveBeenCalledWith('Add task "Write tests" to list "daily"?');
    expect(firstResult.schema).toBe("eddie.tool.task_list.result.v1");
    expect(firstResult.content).toMatch(/Write tests/);
    expect(firstResult.content).toMatch(/daily/);
    const firstIds = firstResult.data.tasks.map((task) => task.id);
    expect(firstIds[0]).toBe("alpha");
    const firstInsertedId = firstIds[1];
    expect(firstInsertedId).toEqual(expect.any(String));
    expect(firstInsertedId).not.toBe("alpha");
    expect(firstInsertedId).not.toBe("omega");
    expect(firstIds[2]).toBe("omega");
    const inserted = firstResult.data.tasks[1];
    expect(inserted.status).toBe("pending");
    expect(inserted.metadata).toEqual({ priority: "high" });

    const secondResult = await tool.handler(
      {
        taskListName: "daily",
        title: "Draft documentation",
        position: 1,
      },
      ctx,
    );

    const secondIds = secondResult.data.tasks.map((task) => task.id);
    const secondInsertedId = secondIds[1];
    expect(secondInsertedId).toEqual(expect.any(String));
    expect(secondIds).toEqual([
      "alpha",
      secondInsertedId,
      firstInsertedId,
      "omega",
    ]);

    const thirdResult = await tool.handler(
      {
        taskListName: "daily",
        title: "Wrap up tasks",
        beforeTaskId: "missing",
      },
      ctx,
    );

    expect(confirm).toHaveBeenCalledTimes(3);
    const thirdIds = thirdResult.data.tasks.map((task) => task.id);
    const thirdInsertedId = thirdIds[thirdIds.length - 1];
    expect(thirdInsertedId).toEqual(expect.any(String));
    expect(thirdIds).toEqual([
      "alpha",
      secondInsertedId,
      firstInsertedId,
      "omega",
      thirdInsertedId,
    ]);
    expect(thirdResult.data.metadata).toEqual({ owner: "agent" });

    const stored = JSON.parse(
      await fs.readFile(
        path.join(workspace, ".tasks", "daily.json"),
        "utf-8",
      ),
    );

    expect(stored.tasks.map((task: { id: string }) => task.id)).toEqual([
      "alpha",
      secondInsertedId,
      firstInsertedId,
      "omega",
      thirdInsertedId,
    ]);
    expect(stored.tasks[2].status).toBe("pending");
    expect(stored.tasks[2].metadata).toEqual({ priority: "high" });
    expect(stored.metadata).toEqual({ owner: "agent" });
  });
});

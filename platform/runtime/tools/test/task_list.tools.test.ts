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

  it("reads a task list with full and abridged output", async () => {
    const tool = findTool("agent__get_task_list");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("agent__get_task_list tool not registered");
    }

    await fs.mkdir(path.join(workspace, ".tasks"), { recursive: true });
    const document = {
      metadata: { sprint: "alpha" },
      tasks: [
        {
          id: "alpha",
          title: "Draft project outline",
          status: "complete",
          summary: "Outline project scope",
          details: "",
          createdAt: "2024-04-01T00:00:00.000Z",
          updatedAt: "2024-04-02T00:00:00.000Z",
        },
        {
          id: "beta",
          title: "Review pull request",
          status: "in_progress",
          summary: "Collaborate with author",
          details: "Ensure coverage improvements are sufficient",
          createdAt: "2024-04-02T00:00:00.000Z",
          updatedAt: "2024-04-03T00:00:00.000Z",
        },
        {
          id: "gamma",
          title: "Publish release notes",
          status: "pending",
          summary: "Write announcement",
          details: "Highlight the major changes",
          createdAt: "2024-04-03T00:00:00.000Z",
          updatedAt: "2024-04-03T00:00:00.000Z",
        },
      ],
      createdAt: "2024-04-01T00:00:00.000Z",
      updatedAt: "2024-04-03T12:00:00.000Z",
    } as const;

    await fs.writeFile(
      path.join(workspace, ".tasks", "daily.json"),
      `${JSON.stringify(document, null, 2)}\n`,
      "utf-8",
    );

    const ctx = { cwd: workspace };

    const full = await tool.handler(
      {
        taskListName: "daily",
      },
      ctx,
    );

    expect(full.schema).toBe("eddie.tool.task_list.result.v1");
    expect(full.data.tasks).toEqual(document.tasks);
    expect(full.data.metadata).toEqual(document.metadata);
    expect(full.content).toContain('Task list "daily"');
    expect(full.content).toContain("Tasks: 3 total");
    expect(full.content).toContain("1. ✓ [complete] Draft project outline — Outline project scope");
    expect(full.content).toContain("2. … [in_progress] Review pull request — Collaborate with author");
    expect(full.content).toContain("3. • [pending] Publish release notes — Write announcement");

    const abridged = await tool.handler(
      {
        taskListName: "daily",
        abridged: true,
      },
      ctx,
    );

    expect(abridged.schema).toBe("eddie.tool.task_list.result.v1");
    expect(abridged.data.tasks).toEqual(document.tasks);
    expect(abridged.content).toContain(
      'Task list "daily" — Next task: Review pull request (in_progress).',
    );
    expect(abridged.content).toContain(
      "Summary: Collaborate with author",
    );
    expect(abridged.content).toContain(
      "Details: Ensure coverage improvements are sufficient",
    );
    expect(abridged.content).not.toContain("Outline project scope");
    expect(abridged.content).not.toContain("Write announcement");
  });

  it("initialises a task list file when none exists", async () => {
    const tool = findTool("agent__get_task_list");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("agent__get_task_list tool not registered");
    }

    const ctx = { cwd: workspace };

    const result = await tool.handler(
      {
        taskListName: "weekly",
      },
      ctx,
    );

    expect(result.schema).toBe("eddie.tool.task_list.result.v1");
    expect(result.data.tasks).toEqual([]);
    expect(result.data.metadata).toEqual({});
    expect(result.content).toContain('Task list "weekly"');
    expect(result.content).toContain("Tasks: 0 total");

    const stored = JSON.parse(
      await fs.readFile(
        path.join(workspace, ".tasks", "weekly.json"),
        "utf-8",
      ),
    );

    expect(stored.tasks).toEqual([]);
    expect(stored.metadata).toEqual({});
    expect(typeof stored.createdAt).toBe("string");
    expect(typeof stored.updatedAt).toBe("string");
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

  it("updates a task status and timestamps when confirmed", async () => {
    const tool = findTool("agent__set_task_status");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("agent__set_task_status tool not registered");
    }

    await fs.mkdir(path.join(workspace, ".tasks"), { recursive: true });
    const initialDocument = {
      metadata: { owner: "agent" },
      tasks: [
        {
          id: "alpha",
          title: "Draft spec",
          status: "pending",
          summary: "Outline",
          details: null,
          metadata: { priority: "high" },
          createdAt: "2024-03-01T00:00:00.000Z",
          updatedAt: "2024-03-01T00:00:00.000Z",
        },
        {
          id: "beta",
          title: "Review pull request",
          status: "in_progress",
          summary: null,
          details: "Check coverage",
          metadata: { reviewer: "bot" },
          createdAt: "2024-03-02T00:00:00.000Z",
          updatedAt: "2024-03-02T12:00:00.000Z",
        },
        {
          id: "gamma",
          title: "Ship release",
          status: "complete",
          summary: null,
          details: null,
          metadata: {},
          createdAt: "2024-03-03T00:00:00.000Z",
          updatedAt: "2024-03-04T00:00:00.000Z",
        },
      ],
      createdAt: "2024-03-01T00:00:00.000Z",
      updatedAt: "2024-03-04T12:00:00.000Z",
    };

    await fs.writeFile(
      path.join(workspace, ".tasks", "daily.json"),
      `${JSON.stringify(initialDocument, null, 2)}\n`,
      "utf-8",
    );

    const confirm = vi.fn().mockResolvedValue(true);
    const ctx = { cwd: workspace, confirm };

    const result = await tool.handler(
      {
        taskListName: "daily",
        taskId: "alpha",
        status: "complete",
      },
      ctx,
    );

    expect(confirm).toHaveBeenCalledWith(
      'Update task "alpha" in list "daily" to status "complete"?',
    );
    expect(result.schema).toBe("eddie.tool.task_list.result.v1");
    expect(result.data.metadata).toEqual(initialDocument.metadata);

    const updatedTask = result.data.tasks.find((task) => task.id === "alpha");
    expect(updatedTask).toBeDefined();
    expect(updatedTask?.status).toBe("complete");
    expect(updatedTask?.createdAt).toBe("2024-03-01T00:00:00.000Z");

    const beta = result.data.tasks.find((task) => task.id === "beta");
    const gamma = result.data.tasks.find((task) => task.id === "gamma");
    expect(beta?.status).toBe("in_progress");
    expect(gamma?.status).toBe("complete");
    expect(beta?.updatedAt).toBe("2024-03-02T12:00:00.000Z");
    expect(gamma?.updatedAt).toBe("2024-03-04T00:00:00.000Z");

    expect(result.data.updatedAt).not.toBe(
      initialDocument.updatedAt,
    );
    expect(updatedTask?.updatedAt).toBe(result.data.updatedAt);
    expect(result.content).toContain("Next task: Review pull request");
    expect(result.content).toContain("in_progress");

    const stored = JSON.parse(
      await fs.readFile(
        path.join(workspace, ".tasks", "daily.json"),
        "utf-8",
      ),
    );

    const storedAlpha = stored.tasks.find((task: { id: string }) => task.id === "alpha");
    const storedBeta = stored.tasks.find((task: { id: string }) => task.id === "beta");
    const storedGamma = stored.tasks.find((task: { id: string }) => task.id === "gamma");

    expect(storedAlpha.status).toBe("complete");
    expect(storedAlpha.updatedAt).toBe(result.data.updatedAt);
    expect(storedBeta.updatedAt).toBe("2024-03-02T12:00:00.000Z");
    expect(storedGamma.updatedAt).toBe("2024-03-04T00:00:00.000Z");
  });

  it("skips updates when confirmation is declined", async () => {
    const tool = findTool("agent__set_task_status");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("agent__set_task_status tool not registered");
    }

    await fs.mkdir(path.join(workspace, ".tasks"), { recursive: true });
    await fs.writeFile(
      path.join(workspace, ".tasks", "daily.json"),
      `${JSON.stringify(
        {
          metadata: {},
          tasks: [
            {
              id: "alpha",
              title: "Draft spec",
              status: "pending",
              summary: null,
              details: null,
              createdAt: "2024-03-01T00:00:00.000Z",
              updatedAt: "2024-03-01T00:00:00.000Z",
            },
          ],
          createdAt: "2024-03-01T00:00:00.000Z",
          updatedAt: "2024-03-01T00:00:00.000Z",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const confirm = vi.fn().mockResolvedValue(false);
    const ctx = { cwd: workspace, confirm };

    const result = await tool.handler(
      {
        taskListName: "daily",
        taskId: "alpha",
        status: "in_progress",
      },
      ctx,
    );

    expect(confirm).toHaveBeenCalledWith(
      'Update task "alpha" in list "daily" to status "in_progress"?',
    );
    expect(result.content).toMatch(/cancelled/i);

    const stored = JSON.parse(
      await fs.readFile(
        path.join(workspace, ".tasks", "daily.json"),
        "utf-8",
      ),
    );

    expect(stored.tasks[0].status).toBe("pending");
    expect(stored.tasks[0].updatedAt).toBe("2024-03-01T00:00:00.000Z");
  });

  it("deletes a task by id when confirmed and cancels cleanly", async () => {
    const tool = findTool("agent__delete_task");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("agent__delete_task tool not registered");
    }

    await fs.mkdir(path.join(workspace, ".tasks"), { recursive: true });
    const initialDocument = {
      metadata: { owner: "agent" },
      tasks: [
        {
          id: "alpha",
          title: "Draft spec",
          status: "pending",
          summary: "Outline the change",
          details: null,
          metadata: { priority: "high" },
          createdAt: "2024-03-01T00:00:00.000Z",
          updatedAt: "2024-03-01T00:00:00.000Z",
        },
        {
          id: "beta",
          title: "Review pull request",
          status: "in_progress",
          summary: null,
          details: "Check coverage",
          metadata: { reviewer: "bot" },
          createdAt: "2024-03-02T00:00:00.000Z",
          updatedAt: "2024-03-02T12:00:00.000Z",
        },
        {
          id: "gamma",
          title: "Ship release",
          status: "pending",
          summary: null,
          details: null,
          metadata: { priority: "medium" },
          createdAt: "2024-03-03T00:00:00.000Z",
          updatedAt: "2024-03-03T00:00:00.000Z",
        },
      ],
      createdAt: "2024-03-01T00:00:00.000Z",
      updatedAt: "2024-03-05T00:00:00.000Z",
    };

    await fs.writeFile(
      path.join(workspace, ".tasks", "daily.json"),
      `${JSON.stringify(initialDocument, null, 2)}\n`,
      "utf-8",
    );

    const confirm = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const ctx = { cwd: workspace, confirm };

    const result = await tool.handler(
      {
        taskListName: "daily",
        taskId: "beta",
      },
      ctx,
    );

    expect(confirm).toHaveBeenNthCalledWith(
      1,
      'Delete task "beta" from list "daily"?',
    );
    expect(result.schema).toBe("eddie.tool.task_list.result.v1");
    expect(result.data.tasks.map((task) => task.id)).toEqual([
      "alpha",
      "gamma",
    ]);
    expect(result.data.updatedAt).not.toBe(initialDocument.updatedAt);

    const alpha = result.data.tasks.find((task) => task.id === "alpha");
    const gamma = result.data.tasks.find((task) => task.id === "gamma");

    expect(alpha?.createdAt).toBe("2024-03-01T00:00:00.000Z");
    expect(alpha?.updatedAt).toBe("2024-03-01T00:00:00.000Z");
    expect(gamma?.createdAt).toBe("2024-03-03T00:00:00.000Z");
    expect(gamma?.updatedAt).toBe("2024-03-03T00:00:00.000Z");
    expect(result.content).toContain("Deleted task \"beta\"");
    expect(result.content).toContain("Next task: Draft spec (pending).");

    const storedAfter = JSON.parse(
      await fs.readFile(
        path.join(workspace, ".tasks", "daily.json"),
        "utf-8",
      ),
    );

    expect(storedAfter.tasks.map((task: { id: string }) => task.id)).toEqual([
      "alpha",
      "gamma",
    ]);
    expect(storedAfter.updatedAt).toBe(result.data.updatedAt);

    const cancelled = await tool.handler(
      {
        taskListName: "daily",
        taskId: "alpha",
      },
      ctx,
    );

    expect(confirm).toHaveBeenNthCalledWith(
      2,
      'Delete task "alpha" from list "daily"?',
    );
    expect(cancelled.schema).toBe("eddie.tool.task_list.result.v1");
    expect(cancelled.data.tasks.map((task) => task.id)).toEqual([
      "alpha",
      "gamma",
    ]);
    expect(cancelled.data.updatedAt).toBe(result.data.updatedAt);
    expect(cancelled.content).toMatch(/cancelled/i);

    const storedFinal = JSON.parse(
      await fs.readFile(
        path.join(workspace, ".tasks", "daily.json"),
        "utf-8",
      ),
    );

    expect(storedFinal).toEqual(storedAfter);
  });

  it("throws when deleting a missing task id", async () => {
    const tool = findTool("agent__delete_task");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("agent__delete_task tool not registered");
    }

    await fs.mkdir(path.join(workspace, ".tasks"), { recursive: true });
    await fs.writeFile(
      path.join(workspace, ".tasks", "daily.json"),
      `${JSON.stringify(
        {
          metadata: {},
          tasks: [
            {
              id: "alpha",
              title: "Draft spec",
              status: "pending",
              summary: null,
              details: null,
              createdAt: "2024-03-01T00:00:00.000Z",
              updatedAt: "2024-03-01T00:00:00.000Z",
            },
          ],
          createdAt: "2024-03-01T00:00:00.000Z",
          updatedAt: "2024-03-01T00:00:00.000Z",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const confirm = vi.fn();
    const ctx = { cwd: workspace, confirm };

    await expect(
      tool.handler(
        {
          taskListName: "daily",
          taskId: "missing",
        },
        ctx,
      ),
    ).rejects.toThrow(/could not find task with id "missing"/i);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("throws when the status is invalid", async () => {
    const tool = findTool("agent__set_task_status");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("agent__set_task_status tool not registered");
    }

    const confirm = vi.fn().mockResolvedValue(true);
    const ctx = { cwd: workspace, confirm };

    await expect(
      tool.handler(
        {
          taskListName: "daily",
          taskId: "alpha",
          status: "invalid" as never,
        },
        ctx,
      ),
    ).rejects.toThrow(/status must be one of/i);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("requires a task id", async () => {
    const tool = findTool("agent__set_task_status");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("agent__set_task_status tool not registered");
    }

    const confirm = vi.fn().mockResolvedValue(true);
    const ctx = { cwd: workspace, confirm };

    await expect(
      tool.handler(
        {
          taskListName: "daily",
          status: "pending",
        } as never,
        ctx,
      ),
    ).rejects.toThrow(/taskId must be provided/i);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("throws when the task id cannot be found", async () => {
    const tool = findTool("agent__set_task_status");

    expect(tool).toBeDefined();
    if (!tool) {
      throw new Error("agent__set_task_status tool not registered");
    }

    await fs.mkdir(path.join(workspace, ".tasks"), { recursive: true });
    await fs.writeFile(
      path.join(workspace, ".tasks", "daily.json"),
      `${JSON.stringify(
        {
          metadata: {},
          tasks: [
            {
              id: "alpha",
              title: "Draft spec",
              status: "pending",
              summary: null,
              details: null,
              createdAt: "2024-03-01T00:00:00.000Z",
              updatedAt: "2024-03-01T00:00:00.000Z",
            },
          ],
          createdAt: "2024-03-01T00:00:00.000Z",
          updatedAt: "2024-03-01T00:00:00.000Z",
        },
        null,
        2,
      )}\n`,
      "utf-8",
    );

    const confirm = vi.fn().mockResolvedValue(true);
    const ctx = { cwd: workspace, confirm };

    await expect(
      tool.handler(
        {
          taskListName: "daily",
          taskId: "missing",
          status: "complete",
        },
        ctx,
      ),
    ).rejects.toThrow(/could not find task with id "missing"/i);
    expect(confirm).not.toHaveBeenCalled();
  });
});

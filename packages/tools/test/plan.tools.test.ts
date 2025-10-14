import fs from "fs/promises";
import os from "os";
import path from "path";
import { describe, expect, it, vi } from "vitest";

import { builtinTools } from "../src/builtin/builtin-tools";

const findTool = (name: string) =>
  builtinTools.find((candidate) => candidate.name === name);

describe("plan tools", () => {
  it("updates plan storage and renders abridged view", async () => {
    const updateTool = findTool("update_plan");
    const getTool = findTool("get_plan");

    expect(updateTool).toBeDefined();
    expect(getTool).toBeDefined();
    if (!updateTool || !getTool) {
      throw new Error("plan tools not registered");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-plan-tools-"));
    const ctx = {
      cwd: tmpDir,
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    const tasks = [
      {
        title: "Set up workspace",
        status: "complete",
        completed: true,
        details: "Install dependencies and scaffolding.",
      },
      {
        title: "Implement planner tools",
        status: "in_progress",
        completed: false,
        details: "Add get_plan and update_plan definitions.",
      },
      {
        title: "Document usage",
        status: "pending",
        completed: false,
        details: "Update README with plan workflow.",
      },
    ];

    try {
      const result = await updateTool.handler(
        {
          tasks,
          abridged: true,
        },
        ctx,
      );

      expect(ctx.confirm).toHaveBeenCalledWith("Update plan with 3 tasks?");
      expect(result.schema).toBe("eddie.tool.plan.result.v1");
      expect(result.data.abridged).toBe(true);
      expect(result.data.plan.tasks).toEqual(tasks);
      expect(typeof result.data.plan.updatedAt).toBe("string");

      const abridged = result.content;
      expect(abridged).toContain("1. ✅ Set up workspace");
      expect(abridged).not.toContain("Install dependencies and scaffolding.");
      expect(abridged).toContain("2. 🔄 Implement planner tools");
      expect(abridged).toContain("Add get_plan and update_plan definitions.");
      expect(abridged).toContain("3. ⏳ Document usage");
      expect(abridged).not.toContain("Update README with plan workflow.");

      const stored = await fs.readFile(
        path.join(tmpDir, ".eddie", "plan.json"),
        "utf-8",
      );
      const parsed = JSON.parse(stored);
      expect(parsed.tasks).toEqual(tasks);
      expect(typeof parsed.updatedAt).toBe("string");

      const full = await getTool.handler(
        {
          abridged: false,
        },
        ctx,
      );

      expect(full.schema).toBe("eddie.tool.plan.result.v1");
      expect(full.data.abridged).toBe(false);
      expect(full.data.plan.tasks).toEqual(tasks);
      expect(full.content).toContain("Install dependencies and scaffolding.");
      expect(full.content).toContain("Add get_plan and update_plan definitions.");
      expect(full.content).toContain("Update README with plan workflow.");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("returns empty plan when storage is missing", async () => {
    const getTool = findTool("get_plan");
    expect(getTool).toBeDefined();
    if (!getTool) {
      throw new Error("get_plan tool not registered");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-plan-tools-"));
    const ctx = {
      cwd: tmpDir,
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    try {
      const result = await getTool.handler(
        {
          abridged: true,
        },
        ctx,
      );

      expect(result.schema).toBe("eddie.tool.plan.result.v1");
      expect(result.data.plan.tasks).toEqual([]);
      expect(result.content).toContain("No plan available");
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("respects plan config overrides and filename arguments", async () => {
    const updateTool = findTool("update_plan");
    const getTool = findTool("get_plan");
    const completeTool = findTool("complete_task");

    expect(updateTool).toBeDefined();
    expect(getTool).toBeDefined();
    expect(completeTool).toBeDefined();
    if (!updateTool || !getTool || !completeTool) {
      throw new Error("plan tools not registered");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-plan-tools-"));
    const ctx = {
      cwd: tmpDir,
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    const configPath = path.join(tmpDir, "eddie.config.json");
    await fs.writeFile(
      configPath,
      JSON.stringify(
        {
          plan: {
            directory: "custom-plan",
            filename: "config-plan.json",
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const tasks = [
      {
        title: "Scaffold plan overrides",
        status: "in_progress",
        completed: false,
      },
    ];

    try {
      const result = await updateTool.handler(
        {
          tasks,
          abridged: false,
          filename: "run-specific-plan.json",
        },
        ctx,
      );

      const expectedPath = path.join(
        tmpDir,
        "custom-plan",
        "run-specific-plan.json",
      );

      const stored = await fs.readFile(expectedPath, "utf-8");
      const parsed = JSON.parse(stored);

      expect(result.data.plan.tasks).toEqual(tasks);
      expect(parsed.tasks).toEqual(tasks);
      expect(ctx.confirm).toHaveBeenCalledWith("Update plan with 1 tasks?");

      const retrieved = await getTool.handler(
        {
          abridged: true,
          filename: "run-specific-plan.json",
        },
        ctx,
      );

      expect(retrieved.data.plan.tasks).toEqual(tasks);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("marks a plan task as complete", async () => {
    const updateTool = findTool("update_plan");
    const getTool = findTool("get_plan");
    const completeTool = findTool("complete_task");

    expect(updateTool).toBeDefined();
    expect(getTool).toBeDefined();
    expect(completeTool).toBeDefined();
    if (!updateTool || !getTool || !completeTool) {
      throw new Error("plan tools not registered");
    }

    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "eddie-plan-tools-"));
    const ctx = {
      cwd: tmpDir,
      confirm: vi.fn(async () => true),
      env: process.env,
    };

    const tasks = [
      {
        title: "Draft feature overview",
        status: "pending",
        completed: false,
        details: "Outline requirements and constraints.",
      },
      {
        title: "Implement planner integration",
        status: "in_progress",
        completed: false,
        details: "Wire up completion tool to existing plan storage.",
      },
    ];

    try {
      await updateTool.handler(
        {
          tasks,
          abridged: false,
        },
        ctx,
      );

      const result = await completeTool.handler(
        {
          taskNumber: 2,
          abridged: true,
        },
        ctx,
      );

      expect(result.schema).toBe("eddie.tool.plan.result.v1");
      expect(result.data.plan.tasks).toHaveLength(2);
      expect(result.data.plan.tasks[0]).toEqual(tasks[0]);
      expect(result.data.plan.tasks[1]).toEqual({
        title: "Implement planner integration",
        status: "complete",
        completed: true,
        details: "Wire up completion tool to existing plan storage.",
      });
      expect(result.content).toContain("1. ⏳ Draft feature overview");
      expect(result.content).toContain("2. ✅ Implement planner integration");
      expect(result.content).not.toContain(
        "Wire up completion tool to existing plan storage.",
      );

      const stored = await getTool.handler(
        {
          abridged: false,
        },
        ctx,
      );

      expect(stored.data.plan.tasks[1].status).toBe("complete");
      expect(stored.data.plan.tasks[1].completed).toBe(true);
      expect(stored.data.plan.tasks[1].details).toBe(
        "Wire up completion tool to existing plan storage.",
      );
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

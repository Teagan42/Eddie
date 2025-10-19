import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "fs/promises";
import os from "os";
import path from "path";

import {
  readTaskListDocument,
  writeTaskListDocument,
} from "../src/builtin/task_list";

const createTempDir = async () =>
  await fs.mkdtemp(path.join(os.tmpdir(), "task-list-test-"));

const removeTempDir = async (directory: string) => {
  await fs.rm(directory, { recursive: true, force: true });
};

describe("task list storage", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await createTempDir();
  });

  afterEach(async () => {
    await removeTempDir(workspace);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("rejects list names containing path separators", async () => {
    await expect(
      writeTaskListDocument({
        rootDir: workspace,
        listName: "foo/bar",
        document: { tasks: [] },
      }),
    ).rejects.toThrow(/path separators/i);
  });

  it("creates a default .tasks directory when writing a list", async () => {
    const tasksDir = path.join(workspace, ".tasks");

    await expect(fs.stat(tasksDir)).rejects.toMatchObject({ code: "ENOENT" });

    await writeTaskListDocument({
      rootDir: workspace,
      listName: "daily",
      document: { tasks: [] },
    });

    const stats = await fs.stat(tasksDir);
    expect(stats.isDirectory()).toBe(true);

    const stored = await fs.readFile(path.join(tasksDir, "daily.json"), "utf-8");
    expect(stored.trim()).not.toHaveLength(0);
  });

  it("round-trips metadata, tasks, and timestamps", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-02-01T12:00:00.000Z"));

    const document = await writeTaskListDocument({
      rootDir: workspace,
      listName: "daily",
      document: {
        metadata: { owner: "agent" },
        tasks: [
          {
            title: "Draft spec",
            summary: "Outline document",
            details: "Start with API contracts",
            status: "in_progress",
            metadata: { estimate: 3 },
          },
          {
            id: "provided-id",
            title: "Review PR",
            status: "complete",
            metadata: { approvals: 2 },
          },
        ],
      },
    });

    expect(document.metadata).toEqual({ owner: "agent" });
    expect(document.createdAt).toBe("2024-02-01T12:00:00.000Z");
    expect(document.updatedAt).toBe("2024-02-01T12:00:00.000Z");

    expect(document.tasks).toHaveLength(2);
    expect(document.tasks[0]).toMatchObject({
      title: "Draft spec",
      summary: "Outline document",
      details: "Start with API contracts",
      status: "in_progress",
      metadata: { estimate: 3 },
    });
    expect(document.tasks[0].id).toMatch(/[0-9a-f-]{36}/i);
    expect(document.tasks[1]).toMatchObject({
      id: "provided-id",
      title: "Review PR",
      summary: null,
      details: null,
      status: "complete",
      metadata: { approvals: 2 },
    });

    const roundTrip = await readTaskListDocument({
      rootDir: workspace,
      listName: "daily",
    });

    expect(roundTrip).toEqual(document);
  });

  it("exposes task list helpers from the package index", async () => {
    const exports = await import("../src/index");
    expect(exports).toMatchObject({
      writeTaskListDocument: expect.any(Function),
      readTaskListDocument: expect.any(Function),
    });
  });
});

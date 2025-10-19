import type { ToolDefinition } from "@eddie/types";

import {
  TASK_LIST_RESULT_SCHEMA,
  readTaskListDocument,
  renderTaskListContent,
  sanitiseTaskListName,
  isTaskListTaskStatus,
  writeTaskListDocument,
  type TaskListDocument,
  type TaskListTaskStatus,
  type TaskListTaskPayload,
} from "./task_list";

interface AgentSetTaskStatusArguments {
  taskListName: string;
  taskId: string;
  status: TaskListTaskStatus;
  abridged?: boolean;
}

const SCHEMA_ID = TASK_LIST_RESULT_SCHEMA.$id;

const sanitiseTaskId = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("taskId must be provided");
  }

  return value.trim();
};

const sanitiseStatus = (value: unknown): TaskListTaskStatus => {
  if (!isTaskListTaskStatus(value)) {
    throw new Error(
      "status must be one of pending, in_progress, or complete",
    );
  }

  return value;
};

const buildResult = (
  document: TaskListDocument,
  listName: string,
  abridged: boolean,
  header: string,
) => ({
  schema: SCHEMA_ID,
  content: `${header}\n${renderTaskListContent({
    listName,
    document,
    abridged,
  })}`.trim(),
  data: document,
});

export const agentSetTaskStatusTool: ToolDefinition = {
  name: "agent__set_task_status",
  description: "Update the status of an existing task within a task list.",
  jsonSchema: {
    type: "object",
    properties: {
      taskListName: { type: "string", minLength: 1 },
      taskId: { type: "string", minLength: 1 },
      status: { enum: ["pending", "in_progress", "complete"] },
      abridged: { type: "boolean" },
    },
    required: ["taskListName", "taskId", "status"],
    additionalProperties: false,
  },
  outputSchema: TASK_LIST_RESULT_SCHEMA,
  async handler(args, ctx) {
    const {
      taskListName: taskListNameInput,
      taskId: taskIdInput,
      status: statusInput,
      abridged,
    } = args as unknown as AgentSetTaskStatusArguments;

    const taskListName = sanitiseTaskListName(taskListNameInput);
    const taskId = sanitiseTaskId(taskIdInput);
    const status = sanitiseStatus(statusInput);
    const abridgedResult = Boolean(abridged);

    const document = await readTaskListDocument({
      rootDir: ctx.cwd,
      listName: taskListName,
    });

    const matchedIndex = document.tasks.findIndex((task) => task.id === taskId);

    if (matchedIndex === -1) {
      throw new Error(
        `Could not find task with id "${taskId}" in list "${taskListName}".`,
      );
    }

    const confirmation = await ctx.confirm(
      `Update task "${taskId}" in list "${taskListName}" to status "${status}"?`,
    );

    if (!confirmation) {
      return buildResult(
        document,
        taskListName,
        abridgedResult,
        `Status update cancelled for "${taskListName}".`,
      );
    }

    const timestamp = new Date().toISOString();
    const tasks: TaskListTaskPayload[] = document.tasks.map((task, index) => {
      const next: TaskListTaskPayload = { ...task };

      if (index === matchedIndex) {
        next.status = status;
        next.updatedAt = timestamp;
      }

      return next;
    });

    const updated = await writeTaskListDocument({
      rootDir: ctx.cwd,
      listName: taskListName,
      document: {
        metadata: document.metadata,
        tasks,
        createdAt: document.createdAt,
      },
      preserveTaskUpdatedAt: true,
    });

    return buildResult(
      updated,
      taskListName,
      abridgedResult,
      `Updated task "${taskId}" to status ${status}.`,
    );
  },
};

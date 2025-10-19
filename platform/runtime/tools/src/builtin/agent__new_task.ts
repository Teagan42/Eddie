import type { ToolDefinition } from "@eddie/types";

import {
  TASK_LIST_RESULT_SCHEMA,
  insertTaskPayload,
  readTaskListDocument,
  sanitiseTaskListName,
  writeTaskListDocument,
  type TaskListDocument,
  type TaskListTaskStatus,
} from "./task_list";

const SCHEMA_ID = TASK_LIST_RESULT_SCHEMA.$id;

const buildResult = (document: TaskListDocument, content: string) => ({
  schema: SCHEMA_ID,
  content,
  data: document,
});

interface AgentNewTaskArguments {
  taskListName: string;
  title: string;
  summary?: string;
  details?: string;
  metadata?: Record<string, unknown>;
  status?: TaskListTaskStatus;
  position?: number;
  beforeTaskId?: string;
}

export const agentNewTaskTool: ToolDefinition = {
  name: "agent__new_task",
  description: "Add a new task to an existing task list.",
  jsonSchema: {
    type: "object",
    properties: {
      taskListName: { type: "string", minLength: 1 },
      title: { type: "string", minLength: 1 },
      summary: { type: "string" },
      details: { type: "string" },
      metadata: { type: "object", additionalProperties: true },
      status: {
        type: "string",
        enum: ["pending", "in_progress", "complete"],
      },
      position: { type: "integer", minimum: 0 },
      beforeTaskId: { type: "string", minLength: 1 },
    },
    required: ["taskListName", "title"],
    additionalProperties: false,
  },
  outputSchema: TASK_LIST_RESULT_SCHEMA,
  async handler(args, ctx) {
    const {
      taskListName: taskListNameInput,
      title,
      summary: summaryText,
      details: detailsText,
      metadata,
      status,
      position,
      beforeTaskId,
    } = args as unknown as AgentNewTaskArguments;

    const taskListName = sanitiseTaskListName(taskListNameInput);

    const confirmation = await ctx.confirm(
      `Add task "${title}" to list "${taskListName}"?`,
    );

    const document = await readTaskListDocument({
      rootDir: ctx.cwd,
      listName: taskListName,
    });

    if (!confirmation) {
      return buildResult(
        document,
        `Task creation cancelled for "${taskListName}".`,
      );
    }

    const { tasks, index } = insertTaskPayload({
      tasks: document.tasks,
      task: {
        title,
        summary: summaryText ?? null,
        details: detailsText ?? null,
        metadata,
        status,
      },
      beforeTaskId,
      position,
    });

    const updated = await writeTaskListDocument({
      rootDir: ctx.cwd,
      listName: taskListName,
      document: {
        metadata: document.metadata,
        tasks,
      },
      preserveTaskUpdatedAt: true,
    });

    const insertedIndex = Math.min(
      Math.max(index, 0),
      updated.tasks.length - 1,
    );
    const inserted = updated.tasks[insertedIndex];

    const content = `Added task "${inserted.title}" (status ${inserted.status}) to "${taskListName}".`;

    return buildResult(updated, content);
  },
};

import type { ToolDefinition } from "@eddie/types";

import {
  TASK_LIST_RESULT_SCHEMA,
  readTaskListDocument,
  formatTaskListResult,
  sanitiseTaskListName,
  sanitiseTaskId,
  writeTaskListDocument,
  type TaskListTaskPayload,
} from "./task_list";

interface AgentDeleteTaskArguments {
  taskListName: string;
  taskId: string;
  abridged?: boolean;
}

export const agentDeleteTaskTool: ToolDefinition = {
  name: "agent__delete_task",
  description: "Delete a task from a task list by id.",
  jsonSchema: {
    type: "object",
    properties: {
      taskListName: { type: "string", minLength: 1 },
      taskId: { type: "string", minLength: 1 },
      abridged: { type: "boolean" },
    },
    required: ["taskListName", "taskId"],
    additionalProperties: false,
  },
  outputSchema: TASK_LIST_RESULT_SCHEMA,
  async handler(args, ctx) {
    const {
      taskListName: taskListNameInput,
      taskId: taskIdInput,
      abridged,
    } = args as unknown as AgentDeleteTaskArguments;

    const taskListName = sanitiseTaskListName(taskListNameInput);
    const taskId = sanitiseTaskId(taskIdInput);
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
      `Delete task "${taskId}" from list "${taskListName}"?`,
    );

    if (!confirmation) {
      return formatTaskListResult({
        document,
        listName: taskListName,
        abridged: abridgedResult,
        header: `Deletion cancelled for "${taskListName}".`,
      });
    }

    const tasks: TaskListTaskPayload[] = document.tasks
      .filter((_, index) => index !== matchedIndex)
      .map((task) => ({ ...task }));

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

    return formatTaskListResult({
      document: updated,
      listName: taskListName,
      abridged: abridgedResult,
      header: `Deleted task "${taskId}" from list "${taskListName}".`,
    });
  },
};


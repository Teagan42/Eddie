import type { ToolDefinition } from "@eddie/types";

import {
  TASK_LIST_RESULT_SCHEMA,
  type TaskListDocument,
  sanitiseTaskListName,
  writeTaskListDocument,
} from "./task_list";

const SCHEMA_ID = TASK_LIST_RESULT_SCHEMA.$id;

const buildResult = (document: TaskListDocument, content: string) => ({
  schema: SCHEMA_ID,
  content,
  data: document,
});

export const agentNewTaskListTool: ToolDefinition = {
  name: "agent__new_task_list",
  description: "Create a new task list for the current workspace.",
  jsonSchema: {
    type: "object",
    properties: {
      taskListName: { type: "string", minLength: 1 },
      metadata: { type: "object", additionalProperties: true },
    },
    required: ["taskListName"],
    additionalProperties: false,
  },
  outputSchema: TASK_LIST_RESULT_SCHEMA,
  async handler(args, ctx) {
    const taskListName = sanitiseTaskListName(args.taskListName);

    const approved = await ctx.confirm(
      `Create new task list "${taskListName}"?`,
    );

    if (!approved) {
      const timestamp = new Date().toISOString();
      return buildResult(
        {
          metadata: {},
          tasks: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        },
        `Task list creation cancelled for "${taskListName}".`,
      );
    }

    const document = await writeTaskListDocument({
      rootDir: ctx.cwd,
      listName: taskListName,
      document: {
        metadata: args.metadata,
        tasks: [],
      },
    });

    return buildResult(
      document,
      `Created task list "${taskListName}" with ${document.tasks.length} tasks.`,
    );
  },
};

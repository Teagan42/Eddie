import type { ToolDefinition } from "@eddie/types";

import {
  TASK_LIST_RESULT_SCHEMA,
  ensureTaskListDocument,
  formatTaskListResult,
  sanitiseTaskListName,
} from "./task_list";

interface AgentGetTaskListArguments {
  taskListName: string;
  abridged?: boolean;
}

export const agentGetTaskListTool: ToolDefinition = {
  name: "agent__get_task_list",
  description: "Retrieve a task list for the current workspace.",
  jsonSchema: {
    type: "object",
    properties: {
      taskListName: { type: "string", minLength: 1 },
      abridged: { type: "boolean" },
    },
    required: ["taskListName"],
    additionalProperties: false,
  },
  outputSchema: TASK_LIST_RESULT_SCHEMA,
  async handler(args, ctx) {
    const { taskListName: taskListNameInput, abridged } =
      args as unknown as AgentGetTaskListArguments;

    const taskListName = sanitiseTaskListName(taskListNameInput);
    const document = await ensureTaskListDocument({
      rootDir: ctx.cwd,
      listName: taskListName,
    });
    return formatTaskListResult({
      document,
      listName: taskListName,
      abridged: Boolean(abridged),
    });
  },
};

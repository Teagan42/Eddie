import type { ToolDefinition } from "@eddie/types";

import {
  TASK_LIST_RESULT_SCHEMA,
  readTaskListDocument,
  renderTaskListContent,
  sanitiseTaskListName,
} from "./task_list";

interface AgentGetTaskListArguments {
  taskListName: string;
  abridged?: boolean;
}

const SCHEMA_ID = TASK_LIST_RESULT_SCHEMA.$id;

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
    const document = await readTaskListDocument({
      rootDir: ctx.cwd,
      listName: taskListName,
    });
    const content = renderTaskListContent({
      listName: taskListName,
      document,
      abridged: Boolean(abridged),
    });

    return {
      schema: SCHEMA_ID,
      content,
      data: document,
    } as const;
  },
};

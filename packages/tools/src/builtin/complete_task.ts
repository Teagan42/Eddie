import type { ToolDefinition } from "@eddie/types";

import {
  PLAN_RESULT_SCHEMA,
  readPlanDocument,
  renderPlanContent,
  sanitisePlanFilename,
  markTaskComplete,
  writePlanDocument,
} from "./plan";

const sanitiseTaskNumber = (value: unknown): number => {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue)) {
    throw new Error("taskNumber must be an integer");
  }

  if (numberValue < 1) {
    throw new Error("taskNumber must be at least 1");
  }

  return numberValue - 1;
};

export const completeTaskTool: ToolDefinition = {
  name: "complete_task",
  description: "Mark a task in the current execution plan as complete.",
  jsonSchema: {
    type: "object",
    properties: {
      taskNumber: { type: "integer", minimum: 1 },
      abridged: { type: "boolean" },
      filename: { type: "string", minLength: 1 },
    },
    required: ["taskNumber"],
    additionalProperties: false,
  },
  outputSchema: PLAN_RESULT_SCHEMA,
  async handler(args, ctx) {
    const abridged = Boolean(args.abridged);
    const filename = sanitisePlanFilename(args.filename);
    const index = sanitiseTaskNumber(args.taskNumber);

    const current = await readPlanDocument(ctx.cwd, ctx.env, filename);

    if (index < 0 || index >= current.tasks.length) {
      throw new Error(`taskNumber must reference an existing task`);
    }

    const tasks = markTaskComplete(current.tasks, index);

    const document = await writePlanDocument(ctx.cwd, tasks, ctx.env, filename);
    const content = renderPlanContent(document, abridged);

    return {
      schema: "eddie.tool.plan.result.v1" as const,
      content,
      data: {
        abridged,
        plan: document,
      },
    };
  },
};

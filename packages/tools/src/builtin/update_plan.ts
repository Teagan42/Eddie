import type { ToolDefinition } from "@eddie/types";

import {
  PLAN_RESULT_SCHEMA,
  PlanTask,
  PlanTaskStatus,
  readPlanDocument,
  renderPlanContent,
  sanitisePlanFilename,
  writePlanDocument,
} from "./plan";

const TASK_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", minLength: 1 },
    status: { enum: ["pending", "in_progress", "complete"] },
    completed: { type: "boolean" },
    details: { type: "string" },
  },
  required: ["title", "status", "completed"],
  additionalProperties: false,
} as const;

const isPlanTaskStatus = (value: unknown): value is PlanTaskStatus =>
  value === "pending" || value === "in_progress" || value === "complete";

const sanitiseTasks = (input: unknown): PlanTask[] => {
  if (!Array.isArray(input)) {
    throw new Error("tasks must be an array of plan entries");
  }

  return input.map((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      throw new Error("each task must be an object");
    }

    const title = String((candidate as { title?: unknown }).title ?? "").trim();
    const status = (candidate as { status?: unknown }).status;
    const detailsRaw = (candidate as { details?: unknown }).details;
    const completedRaw = (candidate as { completed?: unknown }).completed;

    if (!title) {
      throw new Error("task title must be provided");
    }

    if (!isPlanTaskStatus(status)) {
      throw new Error("task status must be pending, in_progress, or complete");
    }

    let completed: boolean;
    if (typeof completedRaw === "boolean") {
      completed = completedRaw;
    } else if (completedRaw === undefined) {
      completed = status === "complete";
    } else {
      throw new Error("task completed must be a boolean");
    }

    const details =
      typeof detailsRaw === "string"
        ? detailsRaw
        : detailsRaw !== undefined && detailsRaw !== null
          ? String(detailsRaw)
          : undefined;

    return {
      title,
      status,
      completed,
      details: details && details.length > 0 ? details : undefined,
    } satisfies PlanTask;
  });
};

export const updatePlanTool: ToolDefinition = {
  name: "update_plan",
  description: "Persist the current execution plan for the workspace.",
  jsonSchema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: TASK_SCHEMA,
      },
      abridged: { type: "boolean" },
      filename: { type: "string", minLength: 1 },
    },
    required: ["tasks"],
    additionalProperties: false,
  },
  outputSchema: PLAN_RESULT_SCHEMA,
  async handler(args, ctx) {
    const abridged = Boolean(args.abridged);
    const tasks = sanitiseTasks(args.tasks);
    const filename = sanitisePlanFilename(args.filename);

    const approved = await ctx.confirm(
      `Update plan with ${tasks.length} tasks?`,
    );

    if (!approved) {
      const current = await readPlanDocument(ctx.cwd, ctx.env, filename);
      return {
        schema: "eddie.tool.plan.result.v1" as const,
        content: renderPlanContent(current, abridged),
        data: {
          abridged,
          plan: current,
        },
      };
    }

    const document = await writePlanDocument(
      ctx.cwd,
      tasks,
      ctx.env,
      filename,
    );
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

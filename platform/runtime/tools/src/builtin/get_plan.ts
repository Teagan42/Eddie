import type { ToolDefinition } from "@eddie/types";

import {
  PLAN_RESULT_SCHEMA,
  readPlanDocument,
  renderPlanContent,
  sanitisePlanFilename,
} from "./plan";

export const getPlanTool: ToolDefinition = {
  name: "get_plan",
  description: "Retrieve the current workspace execution plan.",
  jsonSchema: {
    type: "object",
    properties: {
      abridged: { type: "boolean" },
      filename: { type: "string", minLength: 1 },
    },
    additionalProperties: false,
  },
  outputSchema: PLAN_RESULT_SCHEMA,
  async handler(args, ctx) {
    const abridged = Boolean(args.abridged);
    const filename = sanitisePlanFilename(args.filename);
    const plan = await readPlanDocument(ctx.cwd, ctx.env, filename);
    const content = renderPlanContent(plan, abridged);

    return {
      schema: "eddie.tool.plan.result.v1" as const,
      content,
      data: {
        abridged,
        plan,
      },
    };
  },
};

import fs from "fs/promises";
import path from "path";

export type PlanTaskStatus = "pending" | "in_progress" | "complete";

export interface PlanTask {
  title: string;
  status: PlanTaskStatus;
  details?: string;
}

export interface PlanDocument {
  tasks: PlanTask[];
  updatedAt: string | null;
}

export const PLAN_RESULT_SCHEMA = {
  $id: "eddie.tool.plan.result.v1",
  type: "object",
  properties: {
    abridged: { type: "boolean" },
    plan: {
      type: "object",
      properties: {
        tasks: { type: "array" },
        updatedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
      required: ["tasks", "updatedAt"],
      additionalProperties: true,
    },
  },
  required: ["abridged", "plan"],
  additionalProperties: false,
} as const;

const PLAN_DIRECTORY = ".eddie";
const PLAN_FILENAME = "plan.json";

const planFilePath = (cwd: string): string =>
  path.join(cwd, PLAN_DIRECTORY, PLAN_FILENAME);

const ensurePlanDirectory = async (cwd: string): Promise<void> => {
  const directory = path.join(cwd, PLAN_DIRECTORY);
  await fs.mkdir(directory, { recursive: true });
};

export const readPlanDocument = async (cwd: string): Promise<PlanDocument> => {
  try {
    const file = await fs.readFile(planFilePath(cwd), "utf-8");
    const parsed = JSON.parse(file) as Partial<PlanDocument>;
    return {
      tasks: Array.isArray(parsed.tasks) ? (parsed.tasks as PlanTask[]) : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === "ENOENT") {
        return { tasks: [], updatedAt: null };
      }
    }

    throw error;
  }
};

export const writePlanDocument = async (
  cwd: string,
  tasks: PlanTask[],
): Promise<PlanDocument> => {
  await ensurePlanDirectory(cwd);
  const document: PlanDocument = {
    tasks,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(
    planFilePath(cwd),
    `${JSON.stringify(document, null, 2)}\n`,
    "utf-8",
  );

  return document;
};

const STATUS_SYMBOLS: Record<PlanTaskStatus, string> = {
  complete: "✅",
  in_progress: "🔄",
  pending: "⏳",
};

const shouldIncludeDetails = (
  task: PlanTask,
  abridged: boolean,
): boolean => {
  if (!task.details) {
    return false;
  }

  if (!abridged) {
    return true;
  }

  return task.status === "in_progress";
};

const renderTask = (
  task: PlanTask,
  index: number,
  abridged: boolean,
): string => {
  const symbol = STATUS_SYMBOLS[task.status];
  const lines = [`${index + 1}. ${symbol} ${task.title}`];

  if (shouldIncludeDetails(task, abridged)) {
    lines.push(`   - ${task.details}`);
  }

  return lines.join("\n");
};

export const renderPlanContent = (
  plan: PlanDocument,
  abridged: boolean,
): string => {
  if (!plan.tasks.length) {
    return "No plan available.";
  }

  const tasks = plan.tasks.map((task, index) =>
    renderTask(task, index, abridged),
  );

  return ["Plan:", ...tasks].join("\n");
};

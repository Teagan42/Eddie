import fs from "fs/promises";
import path from "path";
import yaml from "yaml";

export type PlanTaskStatus = "pending" | "in_progress" | "complete";

export interface PlanTask {
  title: string;
  status: PlanTaskStatus;
  completed: boolean;
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
        tasks: {
          type: "array",
          items: {
            type: "object",
            properties: {
              title: { type: "string" },
              status: { enum: ["pending", "in_progress", "complete"] },
              completed: { type: "boolean" },
              details: { type: "string" },
            },
            required: ["title", "status", "completed"],
            additionalProperties: true,
          },
        },
        updatedAt: { anyOf: [{ type: "string" }, { type: "null" }] },
      },
      required: ["tasks", "updatedAt"],
      additionalProperties: true,
    },
  },
  required: ["abridged", "plan"],
  additionalProperties: false,
} as const;

const DEFAULT_PLAN_DIRECTORY = ".eddie";
const DEFAULT_PLAN_FILENAME = "plan.json";

const CONFIG_FILENAMES = [
  "eddie.config.json",
  "eddie.config.yaml",
  "eddie.config.yml",
  ".eddierc",
  ".eddierc.json",
  ".eddierc.yaml",
];

const FORBIDDEN_FILENAME_SEPARATORS = new Set([path.sep, "/", "\\"]);

export const sanitisePlanFilename = (
  value: unknown,
): string | undefined => {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  for (const separator of FORBIDDEN_FILENAME_SEPARATORS) {
    if (separator && trimmed.includes(separator)) {
      throw new Error("filename must not include directory separators");
    }
  }

  return trimmed;
};

const resolveConfigRoots = (
  cwd: string,
  env?: NodeJS.ProcessEnv,
): string[] => {
  const roots = new Set<string>();
  const override = env?.CONFIG_ROOT;
  if (override && override.trim().length > 0) {
    roots.add(path.resolve(cwd, override));
  } else {
    roots.add(path.resolve(cwd, "config"));
  }

  roots.add(cwd);

  return Array.from(roots);
};

type PlanConfig = {
  directory?: string;
  filename?: string;
};

const parsePlanConfig = (input: unknown): PlanConfig => {
  if (!input || typeof input !== "object") {
    return {};
  }

  const planSection = (input as { plan?: unknown }).plan;
  if (!planSection || typeof planSection !== "object") {
    return {};
  }

  const directoryRaw = (planSection as { directory?: unknown }).directory;
  const filenameRaw = (planSection as { filename?: unknown }).filename;

  const directory =
    typeof directoryRaw === "string" && directoryRaw.trim().length > 0
      ? directoryRaw.trim()
      : undefined;

  const filename =
    typeof filenameRaw === "string" && filenameRaw.trim().length > 0
      ? filenameRaw.trim()
      : undefined;

  return { directory, filename };
};

const detectFormat = (filename: string): "json" | "yaml" | "unknown" => {
  if (filename.endsWith(".json")) {
    return "json";
  }

  if (filename.endsWith(".yaml") || filename.endsWith(".yml")) {
    return "yaml";
  }

  return "unknown";
};

const parseConfigContent = (
  content: string,
  filename: string,
): unknown => {
  const hint = detectFormat(filename);

  if (hint === "json") {
    try {
      return JSON.parse(content);
    } catch {
      // Fall through to YAML for invalid JSON content.
    }
  }

  if (hint === "yaml") {
    return yaml.parse(content);
  }

  try {
    return JSON.parse(content);
  } catch {
    return yaml.parse(content);
  }
};

const readPlanConfig = async (
  cwd: string,
  env?: NodeJS.ProcessEnv,
): Promise<PlanConfig> => {
  const roots = resolveConfigRoots(cwd, env);

  for (const root of roots) {
    for (const name of CONFIG_FILENAMES) {
      const candidate = path.resolve(root, name);
      try {
        const content = await fs.readFile(candidate, "utf-8");
        const parsed = parseConfigContent(content, name);
        return parsePlanConfig(parsed);
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          (error as NodeJS.ErrnoException).code === "ENOENT"
        ) {
          continue;
        }

        throw error;
      }
    }
  }

  return {};
};

interface PlanLocation {
  directory: string;
  filename: string;
  directoryPath: string;
  filePath: string;
}

const resolvePlanLocation = async (
  cwd: string,
  env?: NodeJS.ProcessEnv,
  filenameOverride?: string,
): Promise<PlanLocation> => {
  const config = await readPlanConfig(cwd, env);

  const directory = config.directory ?? DEFAULT_PLAN_DIRECTORY;
  const filenameFromConfig = config.filename ?? DEFAULT_PLAN_FILENAME;

  const filename =
    typeof filenameOverride === "string" && filenameOverride.trim().length > 0
      ? filenameOverride.trim()
      : filenameFromConfig;

  const directoryPath = path.join(cwd, directory);
  const filePath = path.join(directoryPath, filename);

  return {
    directory,
    filename,
    directoryPath,
    filePath,
  };
};

const ensurePlanDirectory = async (location: PlanLocation): Promise<void> => {
  await fs.mkdir(location.directoryPath, { recursive: true });
};

const normaliseStoredTask = (task: PlanTask): PlanTask => ({
  ...task,
  completed:
    typeof task.completed === "boolean"
      ? task.completed
      : task.status === "complete",
});

const normaliseStoredTasks = (tasks: PlanTask[]): PlanTask[] =>
  tasks.map((task) => normaliseStoredTask(task));

export const readPlanDocument = async (
  cwd: string,
  env?: NodeJS.ProcessEnv,
  filename?: string,
): Promise<PlanDocument> => {
  try {
    const location = await resolvePlanLocation(cwd, env, filename);
    const file = await fs.readFile(location.filePath, "utf-8");
    const parsed = JSON.parse(file) as Partial<PlanDocument>;
    return {
      tasks: Array.isArray(parsed.tasks)
        ? normaliseStoredTasks(parsed.tasks as PlanTask[])
        : [],
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
  env?: NodeJS.ProcessEnv,
  filename?: string,
): Promise<PlanDocument> => {
  const location = await resolvePlanLocation(cwd, env, filename);
  await ensurePlanDirectory(location);
  const document: PlanDocument = {
    tasks,
    updatedAt: new Date().toISOString(),
  };

  await fs.writeFile(
    location.filePath,
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

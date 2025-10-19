import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export type TaskListTaskStatus = "pending" | "in_progress" | "complete";

export interface TaskListTask {
  id: string;
  title: string;
  status: TaskListTaskStatus;
  summary: string | null;
  details: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TaskListDocument {
  tasks: TaskListTask[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export type TaskListTaskPayload = Partial<Omit<TaskListTask, "metadata" | "summary" | "details" | "title" | "status" | "id">> &
  Record<string, unknown> & {
    id?: string;
    title?: string;
    summary?: string | null;
    details?: string | null;
    metadata?: unknown;
    status?: TaskListTaskStatus;
  };

export interface TaskListDocumentPayload
  extends Partial<Omit<TaskListDocument, "tasks" | "metadata">>,
    Record<string, unknown> {
  tasks?: TaskListTaskPayload[];
  metadata?: unknown;
}

export interface ReadTaskListDocumentOptions {
  rootDir: string;
  listName: string;
}

export interface WriteTaskListDocumentOptions
  extends ReadTaskListDocumentOptions {
  document: TaskListDocumentPayload;
  preserveTaskUpdatedAt?: boolean;
}

export interface InsertTaskPayloadOptions {
  tasks: readonly (TaskListTaskPayload | TaskListTask)[];
  task: TaskListTaskPayload;
  beforeTaskId?: string;
  position?: number;
}

export interface InsertTaskPayloadResult {
  tasks: TaskListTaskPayload[];
  index: number;
}

export const TASK_LIST_RESULT_SCHEMA = {
  $id: "eddie.tool.task_list.result.v1",
  type: "object",
  properties: {
    metadata: { type: "object", additionalProperties: true },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          status: { enum: ["pending", "in_progress", "complete"] },
          summary: { anyOf: [{ type: "string" }, { type: "null" }] },
          details: { anyOf: [{ type: "string" }, { type: "null" }] },
          metadata: { type: "object", additionalProperties: true },
          createdAt: { type: "string" },
          updatedAt: { type: "string" },
        },
        required: [
          "id",
          "title",
          "status",
          "summary",
          "details",
          "createdAt",
          "updatedAt",
        ],
        additionalProperties: true,
      },
    },
    createdAt: { type: "string" },
    updatedAt: { type: "string" },
  },
  required: ["tasks", "createdAt", "updatedAt"],
  additionalProperties: true,
} as const;

const PATH_SEPARATOR_TOKENS = [path.sep, "/", "\\"] as const;
const DEFAULT_TASK_LIST_DIRECTORY = ".tasks";
const TASK_LIST_EXTENSION = ".json";
const TASK_STATUSES: readonly TaskListTaskStatus[] = [
  "pending",
  "in_progress",
  "complete",
];
const TASK_STATUS_SET = new Set<string>(TASK_STATUSES);

const assertValidTaskListName = (listName: string): void => {
  for (const separator of PATH_SEPARATOR_TOKENS) {
    if (separator && listName.includes(separator)) {
      throw new Error("list name must not include path separators");
    }
  }
};

export const sanitiseTaskListName = (value: unknown): string => {
  if (typeof value !== "string") {
    throw new Error("task list name must be a string");
  }

  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("task list name must be provided");
  }

  try {
    assertValidTaskListName(trimmed);
  } catch {
    throw new Error("task list name must not include path separators");
  }

  return trimmed;
};

export const sanitiseTaskId = (value: unknown): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error("taskId must be provided");
  }

  return value.trim();
};

const resolveTaskListDirectory = (rootDir: string): string =>
  path.join(rootDir, DEFAULT_TASK_LIST_DIRECTORY);

const resolveTaskListPath = (rootDir: string, listName: string): string =>
  path.join(resolveTaskListDirectory(rootDir), `${listName}${TASK_LIST_EXTENSION}`);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const normaliseTaskMetadata = (
  value: unknown,
): Record<string, unknown> | undefined => {
  if (!isPlainObject(value)) {
    return undefined;
  }

  return { ...value };
};

const normaliseOptionalText = (value: unknown): string | null => {
  if (typeof value === "string") {
    return value;
  }

  return null;
};

export const isTaskListTaskStatus = (
  value: unknown,
): value is TaskListTaskStatus =>
  typeof value === "string" && TASK_STATUS_SET.has(value);

const normaliseTaskStatus = (value: unknown): TaskListTaskStatus => {
  if (typeof value === "string" && TASK_STATUS_SET.has(value)) {
    return value as TaskListTaskStatus;
  }

  return "pending";
};

const normaliseTaskTitle = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  if (value === undefined || value === null) {
    return "";
  }

  return String(value);
};

const normaliseTaskId = (value: unknown): string => {
  if (typeof value === "string" && value.trim().length > 0) {
    return value;
  }

  return randomUUID();
};

const nowIsoString = (): string => new Date().toISOString();

const normaliseTimestamp = (value: unknown, fallback: string): string => {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  return fallback;
};

const normaliseTaskForWrite = (
  task: TaskListTaskPayload,
  timestamp: string,
  preserveUpdatedAt: boolean,
): TaskListTask => ({
  id: normaliseTaskId(task.id),
  title: normaliseTaskTitle(task.title),
  status: normaliseTaskStatus(task.status),
  summary: normaliseOptionalText(task.summary),
  details: normaliseOptionalText(task.details),
  metadata: normaliseTaskMetadata(task.metadata),
  createdAt: normaliseTimestamp(task.createdAt, timestamp),
  updatedAt:
    preserveUpdatedAt && typeof task.updatedAt === "string" && task.updatedAt.length > 0
      ? task.updatedAt
      : timestamp,
});

const normaliseTaskFromStorage = (
  task: unknown,
  timestamp: string,
): TaskListTask => {
  const payload = (task && typeof task === "object"
    ? (task as TaskListTaskPayload)
    : {}) as TaskListTaskPayload;

  return {
    id: normaliseTaskId(payload.id),
    title: normaliseTaskTitle(payload.title),
    status: normaliseTaskStatus(payload.status),
    summary: normaliseOptionalText(payload.summary),
    details: normaliseOptionalText(payload.details),
    metadata: normaliseTaskMetadata(payload.metadata),
    createdAt: normaliseTimestamp(payload.createdAt, timestamp),
    updatedAt: normaliseTimestamp(payload.updatedAt, timestamp),
  };
};

const normaliseDocumentMetadata = (
  metadata: unknown,
): Record<string, unknown> => {
  if (!isPlainObject(metadata)) {
    return {};
  }

  return { ...metadata };
};

const prepareDocumentForWrite = (
  payload: TaskListDocumentPayload,
  timestamp: string,
  preserveTaskUpdatedAt: boolean,
): TaskListDocument => {
  const tasksInput = Array.isArray(payload.tasks) ? payload.tasks : [];
  const tasks = tasksInput.map((task) =>
    normaliseTaskForWrite(task, timestamp, preserveTaskUpdatedAt),
  );

  return {
    metadata: normaliseDocumentMetadata(payload.metadata),
    tasks,
    createdAt: normaliseTimestamp(payload.createdAt, timestamp),
    updatedAt: timestamp,
  };
};

const normaliseDocumentFromStorage = (
  payload: unknown,
  fallbackTimestamp: string,
): TaskListDocument => {
  const source =
    payload && typeof payload === "object"
      ? (payload as TaskListDocumentPayload)
      : {};

  const tasksInput = Array.isArray(source.tasks) ? source.tasks : [];
  const tasks = tasksInput.map((task) =>
    normaliseTaskFromStorage(task, fallbackTimestamp),
  );

  return {
    metadata: normaliseDocumentMetadata(source.metadata),
    tasks,
    createdAt: normaliseTimestamp(source.createdAt, fallbackTimestamp),
    updatedAt: normaliseTimestamp(source.updatedAt, fallbackTimestamp),
  };
};

const cloneTaskPayload = (
  task: TaskListTaskPayload | TaskListTask,
): TaskListTaskPayload => ({
  ...task,
});

const clampPosition = (value: number, upperBound: number): number => {
  if (!Number.isInteger(value) || value < 0) {
    return upperBound;
  }

  if (value > upperBound) {
    return upperBound;
  }

  return value;
};

export const insertTaskPayload = (
  options: InsertTaskPayloadOptions,
): InsertTaskPayloadResult => {
  const nextTasks = options.tasks.map(cloneTaskPayload);
  const candidate = cloneTaskPayload(options.task);

  let insertIndex = nextTasks.length;

  if (options.beforeTaskId) {
    const matchedIndex = nextTasks.findIndex(
      (task) => task.id === options.beforeTaskId,
    );

    if (matchedIndex >= 0) {
      insertIndex = matchedIndex;
    }
  }

  if (insertIndex === nextTasks.length && typeof options.position === "number") {
    insertIndex = clampPosition(options.position, nextTasks.length);
  }

  nextTasks.splice(insertIndex, 0, candidate);

  return { tasks: nextTasks, index: insertIndex };
};

export const readTaskListDocument = async (
  options: ReadTaskListDocumentOptions,
): Promise<TaskListDocument> => {
  assertValidTaskListName(options.listName);
  const timestamp = nowIsoString();
  const filePath = resolveTaskListPath(options.rootDir, options.listName);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    return normaliseDocumentFromStorage(parsed, timestamp);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === "ENOENT") {
        return {
          metadata: {},
          tasks: [],
          createdAt: timestamp,
          updatedAt: timestamp,
        };
      }
    }

    throw error;
  }
};

export const ensureTaskListDocument = async (
  options: ReadTaskListDocumentOptions,
): Promise<TaskListDocument> => {
  let document = await readTaskListDocument(options);
  const filePath = resolveTaskListPath(options.rootDir, options.listName);

  try {
    await fs.access(filePath);
  } catch (error) {
    if (error && typeof error === "object" && "code" in error) {
      const { code } = error as NodeJS.ErrnoException;
      if (code === "ENOENT") {
        document = await writeTaskListDocument({
          ...options,
          document: {
            metadata: document.metadata,
            tasks: document.tasks.map((task) => cloneTaskPayload(task)),
            createdAt: document.createdAt,
            updatedAt: document.updatedAt,
          },
          preserveTaskUpdatedAt: true,
        });
        return document;
      }
    }

    throw error;
  }

  return document;
};

export const writeTaskListDocument = async (
  options: WriteTaskListDocumentOptions,
): Promise<TaskListDocument> => {
  assertValidTaskListName(options.listName);
  const timestamp = nowIsoString();
  const filePath = resolveTaskListPath(options.rootDir, options.listName);
  await fs.mkdir(resolveTaskListDirectory(options.rootDir), { recursive: true });
  const document = prepareDocumentForWrite(
    options.document,
    timestamp,
    options.preserveTaskUpdatedAt ?? false,
  );
  await fs.writeFile(
    filePath,
    `${JSON.stringify(document, null, 2)}\n`,
    "utf-8",
  );
  return document;
};

const findNextActionableTask = (
  tasks: TaskListTask[],
): TaskListTask | undefined =>
  tasks.find((task) => task.status !== "complete");

const summariseNextActionableTask = (tasks: TaskListTask[]): string => {
  const next = findNextActionableTask(tasks);

  if (!next) {
    return "All tasks are complete.";
  }

  return `Next task: ${next.title} (${next.status}).`;
};

const formatNextTaskDetailLines = (tasks: TaskListTask[]): string[] => {
  const next = findNextActionableTask(tasks);

  if (!next) {
    return [];
  }

  const lines: string[] = [];

  if (typeof next.summary === "string" && next.summary.trim().length > 0) {
    lines.push(`Summary: ${next.summary}`);
  }

  if (typeof next.details === "string" && next.details.trim().length > 0) {
    lines.push(`Details: ${next.details}`);
  }

  return lines;
};

const formatStatusCounts = (tasks: TaskListTask[]): string => {
  const counts = tasks.reduce(
    (totals, task) => {
      totals[task.status] += 1;
      return totals;
    },
    { pending: 0, in_progress: 0, complete: 0 } satisfies Record<TaskListTaskStatus, number>,
  );

  return `pending ${counts.pending}, in_progress ${counts.in_progress}, complete ${counts.complete}`;
};

const formatTaskLine = (task: TaskListTask, index: number): string => {
  const bullet =
    task.status === "complete"
      ? "✓"
      : task.status === "in_progress"
        ? "…"
        : "•";

  const summary = task.summary ? ` — ${task.summary}` : "";

  return `${index + 1}. ${bullet} [${task.status}] ${task.title}${summary}`;
};

export interface RenderTaskListContentOptions {
  listName: string;
  document: TaskListDocument;
  abridged?: boolean;
}

export const renderTaskListContent = (
  options: RenderTaskListContentOptions,
): string => {
  const { listName, document, abridged = false } = options;
  const summary = summariseNextActionableTask(document.tasks);
  const detailLines = formatNextTaskDetailLines(document.tasks);

  if (abridged) {
    const abridgedLines = [`Task list "${listName}" — ${summary}`, ...detailLines];
    return abridgedLines.join("\n").trim();
  }

  const statusCounts = formatStatusCounts(document.tasks);
  const totalLine = `Tasks: ${document.tasks.length} total (${statusCounts})`;
  const taskLines = document.tasks.map(formatTaskLine);
  const body = taskLines.length > 0 ? `\n${taskLines.join("\n")}` : "";
  const details = detailLines.length > 0 ? `\n${detailLines.join("\n")}` : "";

  return `Task list "${listName}"\n${summary}${details}\n${totalLine}${body}`;
};

export interface TaskListResult {
  schema: typeof TASK_LIST_RESULT_SCHEMA.$id;
  content: string;
  data: TaskListDocument;
}

export interface FormatTaskListResultOptions {
  document: TaskListDocument;
  listName: string;
  header?: string;
  abridged?: boolean;
}

export const formatTaskListResult = ({
  document,
  listName,
  header,
  abridged = false,
}: FormatTaskListResultOptions): TaskListResult => {
  const headerLine = header ? header.trim() : "";
  const body = renderTaskListContent({ listName, document, abridged });
  const lines = headerLine.length > 0 ? [headerLine, body] : [body];
  const content = lines.join("\n").trim();

  return {
    schema: TASK_LIST_RESULT_SCHEMA.$id,
    content,
    data: document,
  } as const;
};

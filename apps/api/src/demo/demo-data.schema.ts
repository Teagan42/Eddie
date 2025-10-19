export type ChatSessionStatus = "active" | "archived";
export type ChatMessageRole = "system" | "user" | "assistant" | "tool";
export type TraceStatus = "pending" | "running" | "completed" | "failed";
export type LogLevel = "trace" | "debug" | "info" | "warn" | "error";

export interface DemoSessionSnapshot {
  id: string;
  title: string;
  description?: string;
  status: ChatSessionStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DemoMessageSnapshot {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  toolCallId?: string;
  name?: string;
}

export interface DemoTraceSnapshot {
  id: string;
  sessionId?: string;
  name: string;
  status: TraceStatus;
  durationMs?: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}

export interface DemoLogEntrySnapshot {
  id: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  createdAt: string;
}

export interface DemoData {
  sessions: DemoSessionSnapshot[];
  messages: DemoMessageSnapshot[];
  traces: DemoTraceSnapshot[];
  logs: DemoLogEntrySnapshot[];
}

export class DemoDataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DemoDataValidationError";
  }
}

const messageRoles: ReadonlySet<ChatMessageRole> = new Set([
  "system",
  "user",
  "assistant",
  "tool",
]);

const traceStatuses: ReadonlySet<TraceStatus> = new Set([
  "pending",
  "running",
  "completed",
  "failed",
]);

const logLevels: ReadonlySet<LogLevel> = new Set([
  "trace",
  "debug",
  "info",
  "warn",
  "error",
]);

const sessionStatuses: ReadonlySet<ChatSessionStatus> = new Set([
  "active",
  "archived",
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const fail = (path: string, detail: string): never => {
  throw new DemoDataValidationError(
    path === "<root>"
      ? `Demo data validation failed: ${detail}`
      : `Demo data validation failed at ${path}: ${detail}`,
  );
};

const assertPlainObject = (
  value: unknown,
  path: string,
): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    fail(path, "expected an object");
  }
  return value as Record<string, unknown>;
};

const assertString = (value: unknown, path: string, allowEmpty = false): string => {
  if (typeof value !== "string") {
    fail(path, "expected a string");
  }
  const stringValue = value as string;
  if (!allowEmpty && stringValue.trim().length === 0) {
    fail(path, "expected a non-empty string");
  }
  return stringValue;
};

const assertOptionalString = (
  value: unknown,
  path: string,
  allowEmpty = false,
): string | undefined => {
  if (value === undefined) {
    return undefined;
  }
  return assertString(value, path, allowEmpty);
};

const assertIsoDateString = (value: unknown, path: string): string => {
  const str = assertString(value, path);
  if (Number.isNaN(Date.parse(str))) {
    fail(path, "expected an ISO 8601 date string");
  }
  return str;
};

const assertOptionalNumber = (value: unknown, path: string): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || Number.isNaN(value)) {
    fail(path, "expected a number");
  }
  return value as number;
};

const assertRecord = (
  value: unknown,
  path: string,
): Record<string, unknown> | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (!isPlainObject(value)) {
    fail(path, "expected a JSON object");
  }
  return value as Record<string, unknown>;
};

const assertArray = (value: unknown, path: string): unknown[] => {
  if (!Array.isArray(value)) {
    fail(path, "expected an array");
  }
  return value as unknown[];
};

const validateSession = (
  value: unknown,
  index: number,
): DemoSessionSnapshot => {
  const obj = assertPlainObject(value, `sessions[${index}]`);
  const id = assertString(obj.id, `sessions[${index}].id`);
  const title = assertString(obj.title, `sessions[${index}].title`);
  const description = assertOptionalString(
    obj.description,
    `sessions[${index}].description`,
  );
  const status = assertString(obj.status, `sessions[${index}].status`);
  if (!sessionStatuses.has(status as ChatSessionStatus)) {
    fail(
      `sessions[${index}].status`,
      `expected one of ${[...sessionStatuses].join(", ")}`,
    );
  }
  const createdAt = assertIsoDateString(
    obj.createdAt,
    `sessions[${index}].createdAt`,
  );
  const updatedAt = assertIsoDateString(
    obj.updatedAt,
    `sessions[${index}].updatedAt`,
  );

  return {
    id,
    title,
    description: description ?? undefined,
    status: status as ChatSessionStatus,
    createdAt,
    updatedAt,
  };
};

const validateMessage = (
  value: unknown,
  index: number,
): DemoMessageSnapshot => {
  const obj = assertPlainObject(value, `messages[${index}]`);
  const id = assertString(obj.id, `messages[${index}].id`);
  const sessionId = assertString(obj.sessionId, `messages[${index}].sessionId`);
  const role = assertString(obj.role, `messages[${index}].role`);
  if (!messageRoles.has(role as ChatMessageRole)) {
    fail(
      `messages[${index}].role`,
      `expected one of ${[...messageRoles].join(", ")}`,
    );
  }
  const content = assertString(obj.content, `messages[${index}].content`, true);
  const createdAt = assertIsoDateString(
    obj.createdAt,
    `messages[${index}].createdAt`,
  );
  const toolCallId = assertOptionalString(
    obj.toolCallId,
    `messages[${index}].toolCallId`,
  );
  const name = assertOptionalString(obj.name, `messages[${index}].name`);

  return {
    id,
    sessionId,
    role: role as ChatMessageRole,
    content,
    createdAt,
    toolCallId,
    name,
  };
};

const validateTrace = (
  value: unknown,
  index: number,
): DemoTraceSnapshot => {
  const obj = assertPlainObject(value, `traces[${index}]`);
  const id = assertString(obj.id, `traces[${index}].id`);
  const sessionId = assertOptionalString(
    obj.sessionId,
    `traces[${index}].sessionId`,
  );
  const name = assertString(obj.name, `traces[${index}].name`);
  const status = assertString(obj.status, `traces[${index}].status`);
  if (!traceStatuses.has(status as TraceStatus)) {
    fail(
      `traces[${index}].status`,
      `expected one of ${[...traceStatuses].join(", ")}`,
    );
  }
  const durationMs = assertOptionalNumber(
    obj.durationMs,
    `traces[${index}].durationMs`,
  );
  if (durationMs !== undefined && durationMs < 0) {
    fail(`traces[${index}].durationMs`, "expected a non-negative number");
  }
  const createdAt = assertIsoDateString(
    obj.createdAt,
    `traces[${index}].createdAt`,
  );
  const updatedAt = assertIsoDateString(
    obj.updatedAt,
    `traces[${index}].updatedAt`,
  );
  const metadata = assertRecord(obj.metadata, `traces[${index}].metadata`);

  return {
    id,
    sessionId: sessionId ?? undefined,
    name,
    status: status as TraceStatus,
    durationMs,
    createdAt,
    updatedAt,
    metadata,
  };
};

const validateLog = (
  value: unknown,
  index: number,
): DemoLogEntrySnapshot => {
  const obj = assertPlainObject(value, `logs[${index}]`);
  const id = assertString(obj.id, `logs[${index}].id`);
  const level = assertString(obj.level, `logs[${index}].level`);
  if (!logLevels.has(level as LogLevel)) {
    fail(
      `logs[${index}].level`,
      `expected one of ${[...logLevels].join(", ")}`,
    );
  }
  const message = assertString(obj.message, `logs[${index}].message`, true);
  const context = assertRecord(obj.context, `logs[${index}].context`);
  const createdAt = assertIsoDateString(
    obj.createdAt,
    `logs[${index}].createdAt`,
  );

  return {
    id,
    level: level as LogLevel,
    message,
    context,
    createdAt,
  };
};

export const validateDemoData = (payload: unknown): DemoData => {
  const root = assertPlainObject(payload, "<root>");
  const sessions = assertArray(root.sessions, "sessions").map((value, index) =>
    validateSession(value, index),
  );
  const messages = assertArray(root.messages, "messages").map((value, index) =>
    validateMessage(value, index),
  );
  const traces = assertArray(root.traces, "traces").map((value, index) =>
    validateTrace(value, index),
  );
  const logs = assertArray(root.logs, "logs").map((value, index) =>
    validateLog(value, index),
  );

  return { sessions, messages, traces, logs };
};

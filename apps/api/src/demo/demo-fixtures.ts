import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type {
  AgentInvocationSnapshot,
  ChatSessionStatus,
} from "@eddie/types";

const ISO_DATE_SCHEMA = z
  .string()
  .min(1, "timestamp must be provided")
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "value must be an ISO-8601 date string",
  });

const ROLE_SCHEMA = z.enum(["system", "user", "assistant", "tool"]);

const LOG_LEVEL_SCHEMA = z.enum(["trace", "debug", "info", "warn", "error"]);

const AGENT_INVOCATION_MESSAGE_SCHEMA = z.object({
  role: ROLE_SCHEMA,
  content: z.string(),
  name: z.string().optional(),
  toolCallId: z.string().optional(),
});

const AGENT_INVOCATION_SCHEMA: z.ZodType<AgentInvocationSnapshot> = z.lazy(() =>
  z.object({
    id: z.string().min(1, "id must be provided"),
    provider: z.string().optional(),
    model: z.string().optional(),
    messages: z.array(AGENT_INVOCATION_MESSAGE_SCHEMA),
    children: z.array(AGENT_INVOCATION_SCHEMA),
  })
);

const CHAT_SESSION_STATUS_SCHEMA: z.ZodType<ChatSessionStatus> = z.enum([
  "active",
  "archived",
]);

const CHAT_MESSAGE_SCHEMA = z.object({
  id: z.string().uuid("message id must be a UUID"),
  sessionId: z.string().uuid("sessionId must be a UUID"),
  role: ROLE_SCHEMA,
  content: z.string(),
  createdAt: ISO_DATE_SCHEMA,
  toolCallId: z.string().optional(),
  name: z.string().optional(),
});

const CHAT_SESSION_SCHEMA = z.object({
  session: z.object({
    id: z.string().uuid("session id must be a UUID"),
    title: z.string(),
    description: z.string().optional(),
    status: CHAT_SESSION_STATUS_SCHEMA,
    createdAt: ISO_DATE_SCHEMA,
    updatedAt: ISO_DATE_SCHEMA,
  }),
  messages: z.array(CHAT_MESSAGE_SCHEMA),
  agentInvocations: z.array(AGENT_INVOCATION_SCHEMA).optional(),
});

const TRACE_SCHEMA = z.object({
  id: z.string().uuid("trace id must be a UUID"),
  sessionId: z.string().uuid().optional(),
  name: z.string(),
  status: z.enum(["pending", "running", "completed", "failed"]),
  durationMs: z.number().int().nonnegative().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  createdAt: ISO_DATE_SCHEMA,
  updatedAt: ISO_DATE_SCHEMA,
});

const LOG_ENTRY_SCHEMA = z.object({
  id: z.string().uuid("log id must be a UUID"),
  level: LOG_LEVEL_SCHEMA,
  message: z.string(),
  context: z.record(z.string(), z.unknown()).optional(),
  createdAt: ISO_DATE_SCHEMA,
});

const DATASET_SCHEMA = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  updatedAt: ISO_DATE_SCHEMA,
});

const METADATA_SCHEMA = z
  .object({
    dataset: DATASET_SCHEMA.optional(),
    generator: z.string().optional(),
    version: z.number().int().positive().optional(),
  })
  .optional();

const RUNTIME_CONFIG_SCHEMA = z.object({
  apiUrl: z.string().min(1),
  websocketUrl: z.string().min(1),
  features: z.record(z.string(), z.boolean()),
  theme: z.enum(["light", "dark", "midnight", "aurora"]),
});

const DEMO_FIXTURES_SCHEMA = z.object({
  metadata: METADATA_SCHEMA,
  runtime: z.object({
    config: RUNTIME_CONFIG_SCHEMA,
  }),
  chatSessions: z.array(CHAT_SESSION_SCHEMA),
  traces: z.array(TRACE_SCHEMA),
  logs: z.array(LOG_ENTRY_SCHEMA),
});

export type DemoFixtures = z.infer<typeof DEMO_FIXTURES_SCHEMA>;
export type DemoFixtureChatSession = DemoFixtures["chatSessions"][number];
export type DemoFixtureTrace = DemoFixtures["traces"][number];
export type DemoFixtureLogEntry = DemoFixtures["logs"][number];

export class DemoFixturesError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "DemoFixturesError";
    if (cause) {
      (this as Error & { cause?: unknown }).cause = cause;
    }
  }
}

export function parseDemoFixtures(
  input: unknown,
  source?: string
): DemoFixtures {
  const result = DEMO_FIXTURES_SCHEMA.safeParse(input);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    const location = source ? ` from ${source}` : "";
    throw new DemoFixturesError(`Invalid demo fixtures${location}: ${details}`);
  }
  return result.data;
}

export async function readDemoFixtures(filePath: string): Promise<DemoFixtures> {
  let content: string;
  try {
    content = await readFile(filePath, "utf-8");
  } catch (error) {
    throw new DemoFixturesError(`Failed to read demo fixtures at ${filePath}`, error);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    throw new DemoFixturesError(`Demo fixtures at ${filePath} contain invalid JSON`, error);
  }

  return parseDemoFixtures(parsed, filePath);
}

export function resolveDemoFixturesPath(
  projectDir: string,
  fixturesPath: string
): string {
  if (path.isAbsolute(fixturesPath)) {
    return fixturesPath;
  }
  return path.resolve(projectDir, fixturesPath);
}

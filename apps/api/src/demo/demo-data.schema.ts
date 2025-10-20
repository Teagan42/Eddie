import { z } from "zod";

export const isoDateStringSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "Expected ISO 8601 date string",
  });

export type IsoDateString = z.infer<typeof isoDateStringSchema>;

const unknownRecord = z.object({}).catchall(z.unknown());

export interface DemoAgentInvocationTreeNode {
  id: string;
  agent: string;
  status: string;
  tool?: string;
  output?: unknown;
  children?: DemoAgentInvocationTreeNode[];
}

const agentInvocationSchema: z.ZodType<DemoAgentInvocationTreeNode> = z.lazy(() =>
  z.object({
    id: z.string(),
    agent: z.string(),
    status: z.string(),
    tool: z.string().optional(),
    output: z.unknown().optional(),
    children: z.array(agentInvocationSchema).optional(),
  })
);

export const demoSessionMessageSchema = z.object({
  id: z.string(),
  role: z.string(),
  content: z.string(),
});

export type DemoSessionMessageFixture = z.infer<typeof demoSessionMessageSchema>;

export const demoSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: isoDateStringSchema,
  messages: z.array(demoSessionMessageSchema),
  agentInvocationTree: agentInvocationSchema.optional(),
});

export type DemoSessionFixture = z.infer<typeof demoSessionSchema>;

export const demoSessionsFixtureSchema = z.object({
  sessions: z.array(demoSessionSchema),
});

export type DemoSessionsFixtureFile = z.infer<typeof demoSessionsFixtureSchema>;

export const demoTraceEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  timestamp: isoDateStringSchema,
  payload: unknownRecord,
});

export type DemoTraceEventFixture = z.infer<typeof demoTraceEventSchema>;

export const demoTracesFixtureSchema = z.object({
  events: z.array(demoTraceEventSchema),
});

export type DemoTracesFixtureFile = z.infer<typeof demoTracesFixtureSchema>;

export const demoLogEntrySchema = z.object({
  timestamp: isoDateStringSchema,
  level: z.string(),
  message: z.string(),
  context: unknownRecord.optional(),
});

export type DemoLogEntryFixture = z.infer<typeof demoLogEntrySchema>;

export const demoLogsFixtureSchema = z.object({
  entries: z.array(demoLogEntrySchema),
});

export type DemoLogsFixtureFile = z.infer<typeof demoLogsFixtureSchema>;

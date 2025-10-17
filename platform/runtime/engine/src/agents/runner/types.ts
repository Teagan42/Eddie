import type { AgentIterationPayload } from "../agent-runner";

export type SerializeErrorFn = (
  error: unknown
) => { message: string; stack?: string; cause?: unknown };

export type { AgentIterationPayload };

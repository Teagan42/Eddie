import type { AgentIterationPayload } from "../agent-runner";
import type { SerializedError } from "./error-serialization.util";

export type SerializeErrorFn = (error: unknown) => SerializedError;

export type { AgentIterationPayload };

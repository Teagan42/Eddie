import { CreateTraceHandler } from "./create-trace.handler";
import { UpdateTraceHandler } from "./update-trace.handler";

export { CreateTraceCommand } from "./create-trace.command";
export { CreateTraceHandler } from "./create-trace.handler";
export { UpdateTraceCommand } from "./update-trace.command";
export { UpdateTraceHandler } from "./update-trace.handler";

export const traceCommandHandlers = [
  CreateTraceHandler,
  UpdateTraceHandler,
] as const;

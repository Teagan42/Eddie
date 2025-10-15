import { GetTraceHandler } from "./get-trace.handler";
import { GetTracesHandler } from "./get-traces.handler";

export { GetTraceHandler } from "./get-trace.handler";
export { GetTraceQuery } from "./get-trace.query";
export { GetTracesHandler } from "./get-traces.handler";
export { GetTracesQuery } from "./get-traces.query";

export const traceQueryHandlers = [GetTraceHandler, GetTracesHandler] as const;

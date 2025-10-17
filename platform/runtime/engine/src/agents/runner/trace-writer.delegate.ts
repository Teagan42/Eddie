import { Injectable } from "@nestjs/common";

import type { AgentTraceEvent, AgentRunnerOptions } from "../agent-runner";

export interface TraceWriterRequest {
  event: AgentTraceEvent;
  append?: boolean;
  writeTrace: AgentRunnerOptions["writeTrace"];
}

@Injectable()
export class TraceWriterDelegate {
  async write(request: TraceWriterRequest): Promise<void> {
    const { event, append, writeTrace } = request;
    await writeTrace(event, append);
  }
}

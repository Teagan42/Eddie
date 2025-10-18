import {
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server } from "ws";
import { emitEvent } from "../websocket/utils";
import { TraceDto } from "./dto/trace.dto";

@WebSocketGateway({
  path: "/traces",
})
export class TracesGateway {
  @WebSocketServer()
  private server: Server | null = null;

  private emitTraceEvent(event: TraceEventName, trace: TraceDto): void {
    if (!this.server) {
      return;
    }

    emitEvent(this.server, event, trace);
  }

  emitTraceCreated(trace: TraceDto): void {
    this.emitTraceEvent("trace.created", trace);
  }

  emitTraceUpdated(trace: TraceDto): void {
    this.emitTraceEvent("trace.updated", trace);
  }
}

type TraceEventName = "trace.created" | "trace.updated";

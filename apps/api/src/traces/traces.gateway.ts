import {
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server } from "ws";
import * as websocketUtils from "../websocket/utils";
import { TraceDto } from "./dto/trace.dto";

@WebSocketGateway({
  path: "/traces",
})
export class TracesGateway {
  @WebSocketServer()
  private server!: Server;

  emitTraceCreated(trace: TraceDto): void {
    websocketUtils.emitEvent(
      this.server,
      TracesGateway.TRACE_CREATED_EVENT,
      trace
    );
  }

  emitTraceUpdated(trace: TraceDto): void {
    websocketUtils.emitEvent(
      this.server,
      TracesGateway.TRACE_UPDATED_EVENT,
      trace
    );
  }

  private static readonly TRACE_CREATED_EVENT = "trace.created" as const;

  private static readonly TRACE_UPDATED_EVENT = "trace.updated" as const;
}

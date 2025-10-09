import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server } from "socket.io";
import { TraceDto } from "./dto/trace.dto";
import { TracesListener, TracesService } from "./traces.service";

@WebSocketGateway({
  namespace: "/traces",
  cors: { origin: true, credentials: true },
})
export class TracesGateway
  implements TracesListener, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server;

  private unregister: (() => void) | null = null;

  constructor(private readonly traces: TracesService) {}

  onModuleInit(): void {
    if (!this.traces || typeof this.traces.registerListener !== "function") {
      return;
    }
    this.unregister = this.traces.registerListener(this);
  }

  onModuleDestroy(): void {
    this.unregister?.();
    this.unregister = null;
  }

  onTraceCreated(trace: TraceDto): void {
    this.server.emit("trace.created", trace);
  }

  onTraceUpdated(trace: TraceDto): void {
    this.server.emit("trace.updated", trace);
  }
}

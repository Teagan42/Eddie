import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import { Server } from "socket.io";
import { LogEntryDto } from "./dto/log-entry.dto";
import { LogsListener, LogsService } from "./logs.service";

@WebSocketGateway({
  namespace: "/logs",
  cors: { origin: true, credentials: true },
})
export class LogsGateway
  implements LogsListener, OnModuleInit, OnModuleDestroy
{
  @WebSocketServer()
  private server!: Server;

  private unregister: (() => void) | null = null;

  constructor(private readonly logs: LogsService) {}

  onModuleInit(): void {
    if (!this.logs || typeof this.logs.registerListener !== "function") {
      return;
    }
    this.unregister = this.logs.registerListener(this);
  }

  onModuleDestroy(): void {
    this.unregister?.();
    this.unregister = null;
  }

  onLogCreated(entry: LogEntryDto): void {
    this.server.emit("log.created", entry);
  }
}

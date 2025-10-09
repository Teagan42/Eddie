import { OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server } from "ws";
import { emitEvent } from "../websocket/utils";
import { LogEntryDto } from "./dto/log-entry.dto";
import { LogsListener, LogsService } from "./logs.service";

@WebSocketGateway({
  path: "/logs",
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
    emitEvent(this.server, "log.created", entry);
  }
}

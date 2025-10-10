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
  private pending: LogEntryDto[] = [];
  private flushHandle: NodeJS.Timeout | null = null;

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
    if (this.flushHandle) {
      clearTimeout(this.flushHandle);
      this.flushHandle = null;
    }
    this.flushPending();
  }

  onLogCreated(entry: LogEntryDto): void {
    this.pending.push(entry);
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.flushHandle) {
      return;
    }

    this.flushHandle = setTimeout(() => {
      this.flushHandle = null;
      this.flushPending();
    }, 0);
  }

  private flushPending(): void {
    if (this.pending.length === 0) {
      return;
    }

    const batch = this.pending.splice(0);
    emitEvent(this.server, "logs.created", batch);
  }
}

import { OnModuleDestroy } from "@nestjs/common";
import {
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server } from "ws";
import * as websocketUtils from "../websocket/utils";
import { LogEntryDto } from "./dto/log-entry.dto";

@WebSocketGateway({
  path: "/logs",
})
export class LogsGateway implements OnModuleDestroy {
  @WebSocketServer()
  private server!: Server;

  private pending: LogEntryDto[] = [];
  private flushHandle: NodeJS.Timeout | null = null;

  onModuleDestroy(): void {
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
    websocketUtils.emitEvent(this.server, "logs.created", batch);
  }
}

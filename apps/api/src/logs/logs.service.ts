import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { LogEntryDto } from "./dto/log-entry.dto";

export const MAX_LOG_ENTRIES = 200;

interface ListLogsOptions {
  offset?: number;
  limit?: number;
}

export interface LogsListener {
  onLogCreated(entry: LogEntryDto): void;
}

interface LogEntryEntity {
  id: string;
  level: LogEntryDto["level"];
  message: string;
  context?: Record<string, unknown>;
  createdAt: Date;
}

@Injectable()
export class LogsService {
  private readonly logs: LogEntryEntity[] = [];
  private readonly listeners = new Set<LogsListener>();

  registerListener(listener: LogsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private toDto(entity: LogEntryEntity): LogEntryDto {
    return {
      id: entity.id,
      level: entity.level,
      message: entity.message,
      context: entity.context,
      createdAt: entity.createdAt.toISOString(),
    };
  }

  private notify(entry: LogEntryDto): void {
    for (const listener of this.listeners) {
      listener.onLogCreated(entry);
    }
  }

  list(options: ListLogsOptions = {}): LogEntryDto[] {
    const offset = Math.max(0, options.offset ?? 0);
    const limit = Math.max(0, options.limit ?? 50);

    return this.logs
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .slice(offset, offset + limit)
      .map((entry) => this.toDto(entry));
  }

  append(
    level: LogEntryDto["level"],
    message: string,
    context?: Record<string, unknown>
  ): LogEntryDto {
    const entity: LogEntryEntity = {
      id: randomUUID(),
      level,
      message,
      context,
      createdAt: new Date(),
    };
    this.logs.push(entity);
    if (this.logs.length > MAX_LOG_ENTRIES) {
      this.logs.splice(0, this.logs.length - MAX_LOG_ENTRIES);
    }
    const dto = this.toDto(entity);
    this.notify(dto);
    return dto;
  }
}

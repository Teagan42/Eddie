import { Injectable, Optional } from "@nestjs/common";
import { EventBus } from "@nestjs/cqrs";
import { randomUUID } from "crypto";
import { LogEntryDto } from "./dto/log-entry.dto";
import { LogCreatedEvent } from "./events/log-created.event";

export const MAX_LOG_ENTRIES = 200;

interface ListLogsOptions {
  offset?: number;
  limit?: number;
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
  constructor(@Optional() private readonly eventBus?: EventBus) {}

  private toDto(entity: LogEntryEntity): LogEntryDto {
    return {
      id: entity.id,
      level: entity.level,
      message: entity.message,
      context: entity.context,
      createdAt: entity.createdAt.toISOString(),
    };
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
    this.eventBus?.publish(new LogCreatedEvent(dto));
    return dto;
  }
}

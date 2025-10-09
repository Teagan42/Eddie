import { Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { LogEntryDto } from "./dto/log-entry.dto";

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

  list(): LogEntryDto[] {
    return this.logs
      .slice()
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
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
    const dto = this.toDto(entity);
    this.notify(dto);
    return dto;
  }
}

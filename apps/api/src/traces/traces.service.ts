import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomUUID } from "crypto";
import { TraceDto } from "./dto/trace.dto";

export interface TracesListener {
  onTraceCreated(trace: TraceDto): void;
  onTraceUpdated(trace: TraceDto): void;
}

interface TraceEntity {
  id: string;
  sessionId?: string;
  name: string;
  status: "pending" | "running" | "completed" | "failed";
  durationMs?: number;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const MAX_METADATA_DEPTH = 1_000;

function deepClone<T>(value: T): T {
  if (value === null || typeof value !== "object") {
    return value;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as unknown as T;
  }

  const seen = new WeakMap<object, unknown>();

  const createContainer = (
    source: Record<string, unknown> | unknown[]
  ): Record<string, unknown> | unknown[] =>
    Array.isArray(source) ? new Array(source.length) : {};

  const rootSource = value as Record<string, unknown> | unknown[];
  const rootClone = createContainer(rootSource);
  seen.set(value as object, rootClone);

  const stack: Array<{
    source: Record<string, unknown> | unknown[];
    target: Record<string, unknown> | unknown[];
    depth: number;
  }> = [
    {
      source: rootSource,
      target: rootClone,
      depth: 0,
    },
  ];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (!frame) {
      continue;
    }
    const { source, target, depth } = frame;

    if (depth > MAX_METADATA_DEPTH) {
      throw new BadRequestException(
        "Trace metadata exceeds the supported nesting depth."
      );
    }

    if (Array.isArray(source)) {
      const arrayTarget = target as unknown[];
      for (let index = 0; index < source.length; index += 1) {
        arrayTarget[index] = cloneValue(source[index], depth + 1);
      }
    } else {
      const objectTarget = target as Record<string, unknown>;
      for (const [key, val] of Object.entries(source)) {
        objectTarget[key] = cloneValue(val, depth + 1);
      }
    }
  }

  return rootClone as T;

  function cloneValue(valueToClone: unknown, depth: number): unknown {
    if (valueToClone === null || typeof valueToClone !== "object") {
      return valueToClone;
    }

    if (valueToClone instanceof Date) {
      return new Date(valueToClone.getTime());
    }

    if (seen.has(valueToClone as object)) {
      throw new BadRequestException(
        "Trace metadata cannot contain circular references."
      );
    }

    const container = createContainer(
      valueToClone as Record<string, unknown> | unknown[]
    );
    seen.set(valueToClone as object, container);
    stack.push({
      source: valueToClone as Record<string, unknown> | unknown[],
      target: container,
      depth,
    });
    return container;
  }
}

function cloneMetadata(
  metadata?: Record<string, unknown>
): Record<string, unknown> | undefined {
  if (!metadata) {
    return undefined;
  }
  return deepClone(metadata);
}

@Injectable()
export class TracesService {
  private readonly traces = new Map<string, TraceEntity>();
  private readonly listeners = new Set<TracesListener>();

  registerListener(listener: TracesListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private toDto(entity: TraceEntity): TraceDto {
    return {
      id: entity.id,
      sessionId: entity.sessionId,
      name: entity.name,
      status: entity.status,
      durationMs: entity.durationMs,
      metadata: cloneMetadata(entity.metadata),
      createdAt: entity.createdAt.toISOString(),
      updatedAt: entity.updatedAt.toISOString(),
    };
  }

  private notifyCreated(trace: TraceDto): void {
    for (const listener of this.listeners) {
      listener.onTraceCreated(trace);
    }
  }

  private notifyUpdated(trace: TraceDto): void {
    for (const listener of this.listeners) {
      listener.onTraceUpdated(trace);
    }
  }

  list(): TraceDto[] {
    return Array.from(this.traces.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((trace) => this.toDto(trace));
  }

  get(id: string): TraceDto {
    const trace = this.traces.get(id);
    if (!trace) {
      throw new NotFoundException(`Trace ${id} not found`);
    }
    return this.toDto(trace);
  }

  create(partial: Partial<Omit<TraceEntity, "id" | "createdAt" | "updatedAt">>): TraceDto {
    const now = new Date();
    const entity: TraceEntity = {
      id: randomUUID(),
      name: partial.name ?? "trace",
      sessionId: partial.sessionId,
      status: partial.status ?? "pending",
      durationMs: partial.durationMs,
      metadata: cloneMetadata(partial.metadata),
      createdAt: now,
      updatedAt: now,
    };
    this.traces.set(entity.id, entity);
    const dto = this.toDto(entity);
    this.notifyCreated(dto);
    return dto;
  }

  updateStatus(
    id: string,
    status: TraceEntity["status"],
    durationMs?: number,
    metadata?: Record<string, unknown>
  ): TraceDto {
    const trace = this.traces.get(id);
    if (!trace) {
      throw new NotFoundException(`Trace ${id} not found`);
    }
    trace.status = status;
    trace.durationMs = durationMs;
    trace.metadata = metadata ? cloneMetadata(metadata) : trace.metadata;
    trace.updatedAt = new Date();
    const dto = this.toDto(trace);
    this.notifyUpdated(dto);
    return dto;
  }
}

import { Injectable, NotFoundException } from "@nestjs/common";
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

@Injectable()
export class TracesService {
  private readonly traces = new Map<string, TraceEntity>();
  private readonly listeners = new Set<TracesListener>();

  constructor() {
    const now = Date.now();
    const seeds: Array<Omit<TraceEntity, "id" | "createdAt" | "updatedAt">> = [
      {
        name: "bootstrap",
        status: "completed",
        durationMs: 42,
        metadata: { source: "seed" },
      },
      {
        name: "context hydration",
        status: "running",
        durationMs: 128_000,
        metadata: { stage: "vectorize", dataset: "docs/" },
      },
      {
        name: "agent orchestration",
        status: "pending",
        metadata: { stage: "awaiting command" },
      },
    ];

    seeds.forEach((seed, index) => {
      const createdAt = new Date(now - (seeds.length - index) * 60_000);
      const updatedAt =
        seed.status === "pending"
          ? createdAt
          : new Date(createdAt.getTime() + (seed.durationMs ?? 90_000));
      const entity: TraceEntity = {
        id: randomUUID(),
        ...seed,
        createdAt,
        updatedAt,
      };
      this.traces.set(entity.id, entity);
    });
  }

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
      metadata: entity.metadata,
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
      metadata: partial.metadata,
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
    trace.metadata = metadata ?? trace.metadata;
    trace.updatedAt = new Date();
    const dto = this.toDto(trace);
    this.notifyUpdated(dto);
    return dto;
  }
}

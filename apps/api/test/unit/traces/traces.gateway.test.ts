import { beforeEach, describe, expect, it, vi } from "vitest";
import { TracesGateway } from "../../../src/traces/traces.gateway";
import type { TraceDto } from "../../../src/traces/dto/trace.dto";
import * as websocketUtils from "../../../src/websocket/utils";

const emitEventSpy = vi.spyOn(websocketUtils, "emitEvent");

describe("TracesGateway", () => {
  let gateway: TracesGateway;

  beforeEach(() => {
    gateway = new TracesGateway();
    (gateway as unknown as { server: unknown }).server = {
      clients: new Set(),
    } as unknown;

    emitEventSpy.mockClear();
  });

  it("does not expose module lifecycle hooks", () => {
    expect("onModuleInit" in gateway).toBe(false);
    expect("onModuleDestroy" in gateway).toBe(false);
  });

  it("emits websocket events for created traces", () => {
    const trace: TraceDto = {
      id: "trace-id",
      name: "trace",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const server = (gateway as unknown as { server: unknown }).server;

    gateway.emitTraceCreated(trace);

    expect(emitEventSpy).toHaveBeenCalledWith(server, "trace.created", trace);
  });

  it("emits websocket events for updated traces", () => {
    const trace: TraceDto = {
      id: "trace-id",
      name: "trace",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const server = (gateway as unknown as { server: unknown }).server;

    gateway.emitTraceUpdated(trace);

    expect(emitEventSpy).toHaveBeenCalledWith(server, "trace.updated", trace);
  });
});

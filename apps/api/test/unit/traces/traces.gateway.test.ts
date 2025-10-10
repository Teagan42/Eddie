import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TracesService } from "../../../src/traces/traces.service";
import { TracesGateway } from "../../../src/traces/traces.gateway";
import type { TraceDto } from "../../../src/traces/dto/trace.dto";
import * as websocketUtils from "../../../src/websocket/utils";

const emitEventSpy = vi.spyOn(websocketUtils, "emitEvent");

describe("TracesGateway", () => {
  let registerListener: ReturnType<typeof vi.fn>;
  let unregister: ReturnType<typeof vi.fn>;
  let gateway: TracesGateway;

  beforeEach(() => {
    registerListener = vi.fn();
    unregister = vi.fn();
    registerListener.mockReturnValue(unregister);

    const service = {
      registerListener,
    } as unknown as TracesService;

    gateway = new TracesGateway(service);
    (gateway as unknown as { server: unknown }).server = {
      clients: new Set(),
    } as unknown;

    emitEventSpy.mockClear();
  });

  it("registers itself as a listener when the module starts", () => {
    gateway.onModuleInit();

    expect(registerListener).toHaveBeenCalledWith(gateway);
  });

  it("unregisters the listener during shutdown", () => {
    gateway.onModuleInit();

    gateway.onModuleDestroy();

    expect(unregister).toHaveBeenCalledTimes(1);
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

    gateway.onTraceCreated(trace);

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

    gateway.onTraceUpdated(trace);

    expect(emitEventSpy).toHaveBeenCalledWith(server, "trace.updated", trace);
  });
});

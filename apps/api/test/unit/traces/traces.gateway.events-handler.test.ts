import { describe, expect, it, vi } from "vitest";
import { TracesGatewayEventsHandler } from "../../../src/traces/traces.gateway.events-handler";
import { TraceCreated, TraceUpdated } from "../../../src/traces/events";
import type { TracesGateway } from "../../../src/traces/traces.gateway";
import type { TraceDto } from "../../../src/traces/dto/trace.dto";

describe("TracesGatewayEventsHandler", () => {
  it("forwards created events to the gateway", () => {
    const gateway = {
      emitTraceCreated: vi.fn(),
      emitTraceUpdated: vi.fn(),
    } as unknown as TracesGateway;
    const handler = new TracesGatewayEventsHandler(gateway);
    const trace: TraceDto = {
      id: "trace-id",
      name: "trace",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    handler.handle(new TraceCreated(trace));

    expect(gateway.emitTraceCreated).toHaveBeenCalledWith(trace);
    expect(gateway.emitTraceUpdated).not.toHaveBeenCalled();
  });

  it("forwards updated events to the gateway", () => {
    const gateway = {
      emitTraceCreated: vi.fn(),
      emitTraceUpdated: vi.fn(),
    } as unknown as TracesGateway;
    const handler = new TracesGatewayEventsHandler(gateway);
    const trace: TraceDto = {
      id: "trace-id",
      name: "trace",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    handler.handle(new TraceUpdated(trace));

    expect(gateway.emitTraceUpdated).toHaveBeenCalledWith(trace);
    expect(gateway.emitTraceCreated).not.toHaveBeenCalled();
  });
});

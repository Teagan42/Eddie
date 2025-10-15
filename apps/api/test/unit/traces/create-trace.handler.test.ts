import { describe, expect, it, vi } from "vitest";
import type { EventBus } from "@nestjs/cqrs";
import { CreateTraceCommand } from "../../../src/traces/commands/create-trace.command";
import { CreateTraceHandler } from "../../../src/traces/commands/create-trace.handler";
import type { TracesService } from "../../../src/traces/traces.service";
import type { TraceDto } from "../../../src/traces/dto/trace.dto";
import { TraceCreated } from "../../../src/traces/events";

describe("CreateTraceHandler", () => {
  it("creates a trace through the domain service and publishes events", async () => {
    const trace: TraceDto = {
      id: "trace-id",
      name: "trace-name",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const tracesService = {
      create: vi.fn().mockReturnValue(trace),
    } as unknown as TracesService;

    const eventBus = {
      publish: vi.fn(),
    } as unknown as EventBus;

    const handler = new CreateTraceHandler(tracesService, eventBus);
    const command = new CreateTraceCommand({ name: "trace-name" });

    await expect(handler.execute(command)).resolves.toEqual(trace);
    expect(tracesService.create).toHaveBeenCalledWith({ name: "trace-name" });
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ trace })
    );
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TraceCreated));
  });
});

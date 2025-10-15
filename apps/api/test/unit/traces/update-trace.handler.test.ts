import { describe, expect, it, vi } from "vitest";
import type { EventBus } from "@nestjs/cqrs";
import { UpdateTraceCommand } from "../../../src/traces/commands/update-trace.command";
import { UpdateTraceHandler } from "../../../src/traces/commands/update-trace.handler";
import type { TracesService } from "../../../src/traces/traces.service";
import type { TraceDto } from "../../../src/traces/dto/trace.dto";
import { TraceUpdated } from "../../../src/traces/events";

describe("UpdateTraceHandler", () => {
  it("updates the trace status and publishes events", async () => {
    const trace: TraceDto = {
      id: "trace-id",
      name: "trace",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const tracesService = {
      updateStatus: vi.fn().mockReturnValue(trace),
    } as unknown as TracesService;

    const eventBus = {
      publish: vi.fn(),
    } as unknown as EventBus;

    const handler = new UpdateTraceHandler(tracesService, eventBus);
    const command = new UpdateTraceCommand("trace-id", {
      status: "running",
      durationMs: 123,
      metadata: { attempt: 1 },
    });

    await expect(handler.execute(command)).resolves.toEqual(trace);
    expect(tracesService.updateStatus).toHaveBeenCalledWith(
      "trace-id",
      "running",
      123,
      { attempt: 1 }
    );
    expect(eventBus.publish).toHaveBeenCalledWith(expect.any(TraceUpdated));
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({ trace })
    );
  });
});

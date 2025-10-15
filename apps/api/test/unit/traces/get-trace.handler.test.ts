import { describe, expect, it, vi } from "vitest";
import { GetTraceQuery } from "../../../src/traces/queries";
import { GetTraceHandler } from "../../../src/traces/queries/get-trace.handler";
import type { TracesService } from "../../../src/traces/traces.service";
import type { TraceDto } from "../../../src/traces/dto/trace.dto";

describe("GetTraceHandler", () => {
  it("retrieves a single trace through the domain service", async () => {
    const trace: TraceDto = {
      id: "trace-id",
      name: "trace",
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const tracesService = {
      get: vi.fn().mockReturnValue(trace),
    } as unknown as TracesService;

    const handler = new GetTraceHandler(tracesService);

    await expect(handler.execute(new GetTraceQuery("trace-id"))).resolves.toEqual(trace);
    expect(tracesService.get).toHaveBeenCalledWith("trace-id");
  });
});

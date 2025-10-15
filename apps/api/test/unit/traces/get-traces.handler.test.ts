import { describe, expect, it, vi } from "vitest";
import { GetTracesQuery } from "../../../src/traces/queries/get-traces.query";
import { GetTracesHandler } from "../../../src/traces/queries/get-traces.handler";
import type { TracesService } from "../../../src/traces/traces.service";
import type { TraceDto } from "../../../src/traces/dto/trace.dto";

describe("GetTracesHandler", () => {
  it("retrieves traces through the domain service", async () => {
    const traces: TraceDto[] = [
      {
        id: "one",
        name: "trace-one",
        status: "pending",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    const tracesService = {
      list: vi.fn().mockReturnValue(traces),
    } as unknown as TracesService;

    const handler = new GetTracesHandler(tracesService);

    await expect(handler.execute(new GetTracesQuery())).resolves.toEqual(traces);
    expect(tracesService.list).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { QueryBus } from "@nestjs/cqrs";
import { TracesController } from "../../../src/traces/traces.controller";
import { GetTracesQuery, GetTraceQuery } from "../../../src/traces/queries";
import type { TracesService } from "../../../src/traces/traces.service";

describe("TracesController", () => {
  it("delegates trace listing to the query bus", async () => {
    const traces = [
      {
        id: "trace-id",
        name: "trace",
        status: "pending" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];
    const queryBus = {
      execute: vi.fn().mockResolvedValue(traces),
    } as unknown as QueryBus;
    const controller = new TracesController(queryBus, undefined as unknown as TracesService);

    await expect(controller.list()).resolves.toEqual(traces);
    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetTracesQuery));
  });

  it("fetches a single trace through the query bus", async () => {
    const trace = {
      id: "trace-id",
      name: "trace",
      status: "running" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const queryBus = {
      execute: vi.fn().mockResolvedValue(trace),
    } as unknown as QueryBus;

    const controller = new TracesController(queryBus, undefined as unknown as TracesService);

    await expect(controller.get("trace-id")).resolves.toEqual(trace);
    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetTraceQuery));
  });
});

import { describe, expect, it, vi } from "vitest";
import type { QueryBus } from "@nestjs/cqrs";
import { TracesController } from "../../../src/traces/traces.controller";
import { GetTracesQuery, GetTraceQuery } from "../../../src/traces/queries";

type MockQueryBus = Pick<QueryBus, "execute">;

const createController = (queryBus?: MockQueryBus) => {
  const bus: MockQueryBus = queryBus ?? { execute: vi.fn() };
  return {
    controller: new TracesController(bus as unknown as QueryBus),
    queryBus: bus,
  };
};

describe("TracesController", () => {
  it("only depends on the query bus for trace retrieval", () => {
    expect(TracesController.length).toBe(1);
  });

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
    const { controller, queryBus } = createController({
      execute: vi.fn().mockResolvedValue(traces),
    });

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
    const { controller, queryBus } = createController({
      execute: vi.fn().mockResolvedValue(trace),
    });

    await expect(controller.get("trace-id")).resolves.toEqual(trace);
    expect(queryBus.execute).toHaveBeenCalledWith(expect.any(GetTraceQuery));
  });
});

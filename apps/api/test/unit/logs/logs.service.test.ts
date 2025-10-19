import { describe, expect, it, vi } from "vitest";
import { LogsService } from "../../../src/logs/logs.service";
import { LogCreatedEvent } from "../../../src/logs/events/log-created.event";
import type { EventBus } from "@nestjs/cqrs";

const createService = (publish = vi.fn()) => {
  const eventBus = { publish } as unknown as EventBus;
  const service = new LogsService(eventBus);
  return { service, publish };
};

describe("LogsService", () => {
  it("publishes log created events when appending", () => {
    const { service, publish } = createService();

    const entry = service.append("info", "hello", { foo: "bar" });

    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish).toHaveBeenCalledWith(new LogCreatedEvent(entry));
  });

  it("seeds deterministic entries while preserving identifiers", () => {
    const createdAt = new Date("2024-03-02T10:11:12.000Z");
    const { service, publish } = createService();

    const entry = service.seedEntry({
      id: "log-seeded",
      level: "warn",
      message: "preloaded",
      context: { source: "fixture" },
      createdAt: createdAt.toISOString(),
    });

    expect(entry).toMatchObject({
      id: "log-seeded",
      level: "warn",
      message: "preloaded",
      createdAt: createdAt.toISOString(),
    });
    expect(service.list({ limit: 1 })).toEqual([entry]);
    expect(publish).toHaveBeenCalledWith(new LogCreatedEvent(entry));
  });
});

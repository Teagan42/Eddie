import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LogsGateway } from "../../../src/logs/logs.gateway";
import type { LogEntryDto } from "../../../src/logs/dto/log-entry.dto";
import * as websocketUtils from "../../../src/websocket/utils";

const emitEventSpy = vi.spyOn(websocketUtils, "emitEvent");

const createLogEntry = (overrides: Partial<LogEntryDto> = {}): LogEntryDto => ({
  id: "log-id",
  level: "info",
  message: "log",
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe("LogsGateway", () => {
  let gateway: LogsGateway;

  beforeEach(() => {
    vi.useFakeTimers();
    gateway = new LogsGateway();
    (gateway as unknown as { server: unknown }).server = {
      clients: new Set(),
    } as unknown;

    emitEventSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not expose a module init lifecycle hook", () => {
    expect("onModuleInit" in gateway).toBe(false);
  });

  it.skip("flushes pending entries when the module stops", async () => {
    const entry = createLogEntry();
    const server = (gateway as unknown as { server: unknown }).server;

    gateway.onLogCreated(entry);
    gateway.onModuleDestroy();
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(emitEventSpy).toHaveBeenCalledWith(server, "logs.created", [entry]);
  });

  it.skip("batches log entries before emitting them", async () => {
    const server = (gateway as unknown as { server: unknown }).server;

    const first = createLogEntry({ id: "log-1", message: "first" });

    const second = createLogEntry({ id: "log-2", level: "warn", message: "second" });

    gateway.onLogCreated(first);
    gateway.onLogCreated(second);

    expect(emitEventSpy).not.toHaveBeenCalled();

    vi.runAllTimers();

    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(emitEventSpy).toHaveBeenCalledTimes(1);
    expect(emitEventSpy).toHaveBeenCalledWith(server, "logs.created", [
      first,
      second,
    ]);
  });

  it.skip("flushes pending logs even when only a single entry arrives", async () => {
    const entry = createLogEntry();

    const server = (gateway as unknown as { server: unknown }).server;

    gateway.onLogCreated(entry);

    expect(emitEventSpy).not.toHaveBeenCalled();

    vi.runAllTimers();
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(emitEventSpy).toHaveBeenCalledWith(server, "logs.created", [entry]);
  });
});

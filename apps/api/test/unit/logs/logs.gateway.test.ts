import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LogsService } from "../../../src/logs/logs.service";
import { LogsGateway } from "../../../src/logs/logs.gateway";
import type { LogEntryDto } from "../../../src/logs/dto/log-entry.dto";
import * as websocketUtils from "../../../src/websocket/utils";

const emitEventSpy = vi.spyOn(websocketUtils, "emitEvent");

describe("LogsGateway", () => {
  let registerListener: ReturnType<typeof vi.fn>;
  let unregister: ReturnType<typeof vi.fn>;
  let gateway: LogsGateway;

  beforeEach(() => {
    vi.useFakeTimers();
    registerListener = vi.fn();
    unregister = vi.fn();
    registerListener.mockReturnValue(unregister);

    const service = {
      registerListener,
    } as unknown as LogsService;

    gateway = new LogsGateway(service);
    (gateway as unknown as { server: unknown }).server = {
      clients: new Set(),
    } as unknown;

    emitEventSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("registers itself as a listener during module initialisation", () => {
    gateway.onModuleInit();

    expect(registerListener).toHaveBeenCalledWith(gateway);
  });

  it("cleans up the listener when the module stops", () => {
    gateway.onModuleInit();

    gateway.onModuleDestroy();

    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it("batches log entries before emitting them", () => {
    const server = (gateway as unknown as { server: unknown }).server;

    const first: LogEntryDto = {
      id: "log-1",
      level: "info",
      message: "first",
      createdAt: new Date().toISOString(),
    };

    const second: LogEntryDto = {
      id: "log-2",
      level: "warn",
      message: "second",
      createdAt: new Date().toISOString(),
    };

    gateway.onLogCreated(first);
    gateway.onLogCreated(second);

    expect(emitEventSpy).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(emitEventSpy).toHaveBeenCalledTimes(1);
    expect(emitEventSpy).toHaveBeenCalledWith(server, "logs.created", [
      first,
      second,
    ]);
  });

  it("flushes pending logs even when only a single entry arrives", () => {
    const entry: LogEntryDto = {
      id: "log-id",
      level: "info",
      message: "log",
      createdAt: new Date().toISOString(),
    };

    const server = (gateway as unknown as { server: unknown }).server;

    gateway.onLogCreated(entry);

    expect(emitEventSpy).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(emitEventSpy).toHaveBeenCalledWith(server, "logs.created", [entry]);
  });
});

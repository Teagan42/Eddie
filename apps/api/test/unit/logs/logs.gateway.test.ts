import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("registers itself as a listener during module initialisation", () => {
    gateway.onModuleInit();

    expect(registerListener).toHaveBeenCalledWith(gateway);
  });

  it("cleans up the listener when the module stops", () => {
    gateway.onModuleInit();

    gateway.onModuleDestroy();

    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it("emits websocket events for new log entries", () => {
    const entry: LogEntryDto = {
      id: "log-id",
      level: "info",
      message: "log", 
      createdAt: new Date().toISOString(),
    };

    const server = (gateway as unknown as { server: unknown }).server;

    gateway.onLogCreated(entry);

    expect(emitEventSpy).toHaveBeenCalledWith(server, "log.created", entry);
  });
});

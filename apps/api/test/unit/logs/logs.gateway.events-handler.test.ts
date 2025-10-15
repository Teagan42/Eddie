import { afterEach, describe, expect, it, vi } from "vitest";
import { LogsGateway } from "../../../src/logs/logs.gateway";
import { LogsGatewayEventsHandler } from "../../../src/logs/logs.gateway.events-handler";
import { LogCreatedEvent } from "../../../src/logs/events/log-created.event";
import type { LogEntryDto } from "../../../src/logs/dto/log-entry.dto";
import type { Server } from "ws";
import { WebSocket } from "ws";

const createLogEntry = (): LogEntryDto => ({
  id: "log-1",
  level: "info",
  message: "Test log entry",
  context: { foo: "bar" },
  createdAt: new Date().toISOString(),
});

describe("LogsGatewayEventsHandler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits logs.created batches when log events are published", () => {
    vi.useFakeTimers();

    const gateway = new LogsGateway();

    const clientSend = vi.fn();
    const client = {
      readyState: WebSocket.OPEN,
      send: clientSend,
    } as unknown as WebSocket;
    const server = { clients: new Set([client]) } as unknown as Server;
    (gateway as { server: Server }).server = server;

    const handler = new LogsGatewayEventsHandler(gateway);

    const entry = createLogEntry();
    handler.handle(new LogCreatedEvent(entry));

    vi.runAllTimers();

    expect(clientSend).toHaveBeenCalledWith(
      JSON.stringify({ event: "logs.created", data: [ entry ] })
    );
  });
});

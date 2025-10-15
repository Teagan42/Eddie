import "reflect-metadata";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Server } from "ws";
import { WebSocket } from "ws";
import { RuntimeConfigGateway } from "../../src/runtime-config/runtime-config.gateway";
import { RuntimeConfigGatewayEventsHandler } from "../../src/runtime-config/runtime-config.gateway.events-handler";
import { RuntimeConfigUpdated } from "../../src/runtime-config/events/runtime-config-updated.event";
import type { RuntimeConfigDto } from "../../src/runtime-config/dto/runtime-config.dto";

describe("RuntimeConfigGateway integration", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createGateway = () => {
    const gateway = new RuntimeConfigGateway();
    const clientSend = vi.fn();
    const client = {
      readyState: WebSocket.OPEN,
      send: clientSend,
    } as unknown as WebSocket;
    const server = { clients: new Set([client]) } as unknown as Server;
    (gateway as { server: Server }).server = server;
    return { gateway, clientSend };
  };

  it("emits config.updated websocket messages when runtime config events are handled", () => {
    const { gateway, clientSend } = createGateway();
    const handler = new RuntimeConfigGatewayEventsHandler(gateway);

    const config: RuntimeConfigDto = {
      apiUrl: "http://localhost:3000",
      websocketUrl: "ws://localhost:3000",
      features: { chat: true, logs: true, traces: true },
      theme: "dark",
    };

    handler.handle(new RuntimeConfigUpdated(config));

    expect(clientSend).toHaveBeenCalledWith(
      JSON.stringify({ event: "config.updated", data: config })
    );
  });

  it("does not rely on runtime config service listeners during module init", () => {
    const { gateway } = createGateway();

    expect("onModuleInit" in gateway).toBe(false);
  });
});

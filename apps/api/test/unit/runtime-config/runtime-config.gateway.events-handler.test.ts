import { describe, expect, it, vi } from "vitest";
import { RuntimeConfigGatewayEventsHandler } from "../../../src/runtime-config/runtime-config.gateway.events-handler";
import { RuntimeConfigGateway } from "../../../src/runtime-config/runtime-config.gateway";
import { RuntimeConfigUpdated } from "../../../src/runtime-config/events/runtime-config-updated.event";

const runtimeConfig = {
  apiUrl: "https://api.example.test",
  websocketUrl: "wss://ws.example.test",
  features: { chat: true },
  theme: "dark" as const,
};

describe("RuntimeConfigGatewayEventsHandler", () => {
  it("relays runtime configuration updates to the gateway", () => {
    const gateway = {
      emitConfigUpdated: vi.fn(),
    } as unknown as RuntimeConfigGateway;
    const handler = new RuntimeConfigGatewayEventsHandler(gateway);

    handler.handle(new RuntimeConfigUpdated(runtimeConfig));

    expect(gateway.emitConfigUpdated).toHaveBeenCalledWith(runtimeConfig);
  });
});

import { describe, expect, it, vi } from "vitest";
import type { EventBus } from "@nestjs/cqrs";
import type { RuntimeConfigService } from "../../../src/runtime-config/runtime-config.service";
import { GetRuntimeConfigHandler } from "../../../src/runtime-config/queries/get-runtime-config.handler";
import { GetRuntimeConfigQuery } from "../../../src/runtime-config/queries/get-runtime-config.query";
import { UpdateRuntimeConfigHandler } from "../../../src/runtime-config/commands/update-runtime-config.handler";
import { UpdateRuntimeConfigCommand } from "../../../src/runtime-config/commands/update-runtime-config.command";
import { RuntimeConfigUpdatedEvent } from "../../../src/runtime-config/events/runtime-config-updated.event";

const runtimeConfig = {
  apiUrl: "https://api.example.test",
  websocketUrl: "wss://ws.example.test",
  features: {
    chat: true,
  },
  theme: "dark" as const,
};

describe("RuntimeConfig CQRS handlers", () => {
  const createServiceWithGet = () =>
    ({
      get: vi.fn().mockReturnValue(runtimeConfig),
    } as unknown as RuntimeConfigService);

  it("returns the runtime configuration snapshot through the query handler", async () => {
    const service = createServiceWithGet();

    const handler = new GetRuntimeConfigHandler(service);

    await expect(handler.execute(new GetRuntimeConfigQuery())).resolves.toEqual(
      runtimeConfig
    );
    expect(service.get).toHaveBeenCalledTimes(1);
  });

  it("exposes a zero-arity execute method for the query handler", () => {
    const service = createServiceWithGet();

    const handler = new GetRuntimeConfigHandler(service);

    expect(handler.execute.length).toBe(0);
  });

  it("updates the runtime configuration and publishes the update event", async () => {
    const service = {
      update: vi.fn().mockReturnValue(runtimeConfig),
    } as unknown as RuntimeConfigService;
    const eventBus = {
      publish: vi.fn(),
    } as unknown as EventBus;

    const handler = new UpdateRuntimeConfigHandler(service, eventBus);
    const partialUpdate = { theme: "dark" as const };

    await expect(
      handler.execute(new UpdateRuntimeConfigCommand(partialUpdate))
    ).resolves.toEqual(runtimeConfig);

    expect(service.update).toHaveBeenCalledWith(expect.objectContaining(partialUpdate));
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        config: runtimeConfig,
      })
    );
    expect(eventBus.publish).toHaveBeenCalledWith(
      expect.any(RuntimeConfigUpdatedEvent)
    );
  });
});

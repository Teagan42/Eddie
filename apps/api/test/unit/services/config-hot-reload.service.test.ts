import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConfigFileSnapshot, EddieConfig, EddieConfigInput } from "@eddie/types";
import { ConfigHotReloadService } from "../../../src/config-editor/config-hot-reload.service";
import type { RuntimeConfigDto } from "../../../src/runtime-config/dto/runtime-config.dto";
import { RuntimeConfigUpdated } from "../../../src/runtime-config/events/runtime-config-updated.event";

describe("ConfigHotReloadService", () => {
  let service: ConfigHotReloadService;
  const configService = {
    parseSource: vi.fn(),
    compose: vi.fn(),
    writeSource: vi.fn(),
  };
  const configStore = {
    setSnapshot: vi.fn(),
  };
  const runtimeConfigService = {
    get: vi.fn(),
  };
  const eventBus = {
    publish: vi.fn(),
  };

  const runtimeConfig: RuntimeConfigDto = {
    apiUrl: "https://api.example.test",
    websocketUrl: "wss://api.example.test",
    features: { chat: true, logs: true, traces: false },
    theme: "midnight",
  };

  const input: EddieConfigInput = {
    model: "gpt-4o-mini",
  } as EddieConfigInput;

  const composedConfig: EddieConfig = {
    model: "gpt-4o-mini",
    projectDir: process.cwd(),
  } as EddieConfig;

  const snapshot: ConfigFileSnapshot = {
    path: "/tmp/eddie.config.json",
    format: "json",
    content: "{}",
    input,
    config: undefined,
    error: null,
  };

  beforeEach(() => {
    service = new ConfigHotReloadService(
      configService as never,
      configStore as never,
      runtimeConfigService as never,
      eventBus as never
    );

    configService.parseSource.mockReset().mockReturnValue(input);
    configService.compose.mockReset().mockResolvedValue(composedConfig);
    configService.writeSource.mockReset().mockResolvedValue(snapshot);
    configStore.setSnapshot.mockReset();
    runtimeConfigService.get.mockReset().mockReturnValue(runtimeConfig);
    eventBus.publish.mockReset();
  });

  it("persists config changes and broadcasts runtime updates", async () => {
    await expect(service.persist("{}", "json")).resolves.toMatchObject({
      config: composedConfig,
    });

    expect(configService.parseSource).toHaveBeenCalledWith("{}", "json");
    expect(configService.compose).toHaveBeenCalledWith(input, {});
    expect(configService.writeSource).toHaveBeenCalledWith("{}", "json", {});
    expect(configStore.setSnapshot).toHaveBeenCalledWith(composedConfig);
    expect(runtimeConfigService.get).toHaveBeenCalledWith();

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    const published = eventBus.publish.mock.calls[0][0];
    expect(published).toBeInstanceOf(RuntimeConfigUpdated);
    expect(published.config).toEqual(runtimeConfig);
  });
});

import type { ConfigFileFormat, ConfigFileSnapshot, EddieConfig, EddieConfigInput } from "@eddie/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigHotReloadService } from "../../../src/config-editor/config-hot-reload.service";

describe("ConfigHotReloadService", () => {
  const source = "model: gpt-4";
  const format: ConfigFileFormat = "yaml";

  let configService: {
    parseSource: ReturnType<typeof vi.fn>;
    compose: ReturnType<typeof vi.fn>;
    writeSource: ReturnType<typeof vi.fn>;
  };
  let configStore: { setSnapshot: ReturnType<typeof vi.fn> };
  let service: ConfigHotReloadService;

  const input: EddieConfigInput = { model: "gpt-4" } as EddieConfigInput;
  const composed: EddieConfig = {
    model: "gpt-4",
    projectDir: process.cwd(),
  } as EddieConfig;
  const snapshot: ConfigFileSnapshot = {
    path: "/tmp/eddie.config.yaml",
    format,
    content: source,
    input,
    config: composed,
    error: null,
  };

  beforeEach(() => {
    configService = {
      parseSource: vi.fn(),
      compose: vi.fn(),
      writeSource: vi.fn(),
    };
    configStore = { setSnapshot: vi.fn() };
    service = new ConfigHotReloadService(
      configService as never,
      configStore as never
    );
  });

  it("returns the composed config along with the snapshot metadata", async () => {
    configService.parseSource.mockReturnValue(input);
    configService.compose.mockResolvedValue(composed);
    configService.writeSource.mockResolvedValue(snapshot);

    await expect(service.persist(source, format)).resolves.toEqual({
      ...snapshot,
      config: composed,
    });

    expect(configService.parseSource).toHaveBeenCalledWith(source, format);
    expect(configService.compose).toHaveBeenCalledWith(input, {});
    expect(configService.writeSource).toHaveBeenCalledWith(source, format, {});
    expect(configStore.setSnapshot).toHaveBeenCalledWith(composed);
  });

  it("propagates composition errors without writing", async () => {
    const error = new Error("compose failed");
    configService.parseSource.mockReturnValue(input);
    configService.compose.mockRejectedValue(error);

    await expect(service.persist(source, format)).rejects.toBe(error);

    expect(configService.writeSource).not.toHaveBeenCalled();
    expect(configStore.setSnapshot).not.toHaveBeenCalled();
  });

  it("stores the composed config even when the snapshot omits config", async () => {
    const incompleteSnapshot: ConfigFileSnapshot = {
      ...snapshot,
      config: undefined,
    };

    configService.parseSource.mockReturnValue(input);
    configService.compose.mockResolvedValue(composed);
    configService.writeSource.mockResolvedValue(incompleteSnapshot);

    await expect(service.persist(source, format)).resolves.toEqual({
      ...incompleteSnapshot,
      config: composed,
    });

    expect(configStore.setSnapshot).toHaveBeenCalledWith(composed);
  });
});

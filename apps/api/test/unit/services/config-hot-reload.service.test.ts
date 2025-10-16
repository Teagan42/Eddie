import type {
  ConfigFileFormat,
  ConfigFileSnapshot,
  EddieConfig,
  EddieConfigInput,
} from "@eddie/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigHotReloadService } from "../../../src/config-editor/config-hot-reload.service";

interface ConfigServiceMock {
  parseSource: ReturnType<typeof vi.fn>;
  compose: ReturnType<typeof vi.fn>;
  writeSource: ReturnType<typeof vi.fn>;
}

interface ConfigStoreMock {
  setSnapshot: ReturnType<typeof vi.fn>;
}

describe("ConfigHotReloadService", () => {
  let service: ConfigHotReloadService;
  let configService: ConfigServiceMock;
  let configStore: ConfigStoreMock;
  const configFilePath = "/etc/eddie/eddie.config.yaml";

  const createSnapshot = (
    overrides: Partial<ConfigFileSnapshot> = {}
  ): ConfigFileSnapshot => ({
    path: configFilePath,
    format: "yaml",
    content: "model: gpt-4",
    input: { model: "gpt-4" } as EddieConfigInput,
    config: { model: "gpt-4", projectDir: process.cwd() } as EddieConfig,
    error: null,
    ...overrides,
  });

  beforeEach(() => {
    configService = {
      parseSource: vi.fn(),
      compose: vi.fn(),
      writeSource: vi.fn(),
    } satisfies ConfigServiceMock;

    configStore = {
      setSnapshot: vi.fn(),
    } satisfies ConfigStoreMock;

    const ServiceCtor = ConfigHotReloadService as unknown as new (
      configService: ConfigServiceMock,
      configStore: ConfigStoreMock,
      configFilePath?: string | null
    ) => ConfigHotReloadService;

    service = new ServiceCtor(
      configService as never,
      configStore as never,
      configFilePath
    );
  });

  it("persists using the configured file path when provided", async () => {
    const snapshot = createSnapshot();

    configService.parseSource.mockReturnValue(snapshot.input);
    configService.compose.mockResolvedValue(snapshot.config as EddieConfig);
    configService.writeSource.mockResolvedValue(snapshot);

    await expect(service.persist(snapshot.content, snapshot.format)).resolves.toMatchObject({
      path: configFilePath,
    });

    expect(configService.writeSource).toHaveBeenCalledWith(
      snapshot.content,
      snapshot.format,
      {},
      configFilePath
    );
  });
});

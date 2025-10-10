import { describe, expect, it, vi } from "vitest";
import { RuntimeConfigDto } from "../../../src/runtime-config/dto/runtime-config.dto";
import { RuntimeConfigService } from "../../../src/runtime-config/runtime-config.service";

const ServiceCtor = RuntimeConfigService as unknown as new (
  configService: {
    get: (key: string, options?: unknown) => unknown;
  }
) => RuntimeConfigService;

const defaultRuntimeConfig: RuntimeConfigDto = {
  apiUrl: "http://localhost:3000",
  websocketUrl: "ws://localhost:3000",
  features: {
    traces: true,
    logs: true,
    chat: true,
  },
  theme: "dark",
};

function createService(
  runtimeConfig: RuntimeConfigDto = defaultRuntimeConfig
): {
  service: RuntimeConfigService;
  configService: {
    get: ReturnType<typeof vi.fn>;
  };
} {
  const configService = {
    get: vi.fn((key: string) => {
      if (key === "runtime") {
        return runtimeConfig;
      }

      return undefined;
    }),
  } as const;

  return {
    service: new ServiceCtor(configService),
    configService,
  };
}

class RuntimeConfigListenerSpy {
  updates = 0;
  onConfigChanged(): void {
    this.updates += 1;
  }
}

describe("RuntimeConfigService", () => {
  it("merges updates and notifies listeners", () => {
    const { service } = createService();
    const spy = new RuntimeConfigListenerSpy();
    service.registerListener(spy);

    const updated = service.update({ theme: "light" });
    expect(updated.theme).toBe("light");
    expect(spy.updates).toBe(1);
  });

  it("deep merges feature flags so unrelated defaults remain", () => {
    const { service } = createService();
    const received: RuntimeConfigDto[] = [];
    service.registerListener({
      onConfigChanged: (config) => {
        received.push(config);
      },
    });

    const updated = service.update({ features: { chat: false } });
    const expectedFeatures = {
      chat: false,
      logs: true,
      traces: true,
    } satisfies RuntimeConfigDto["features"];

    expect(updated.features).toEqual(expectedFeatures);
    expect(received).toHaveLength(1);
    expect(received[0].features).toEqual(expectedFeatures);
  });

  it("returns a cloned snapshot from get so external mutations do not leak", () => {
    const { service } = createService();

    const snapshot = service.get();
    snapshot.theme = "light";
    snapshot.features.chat = false;

    const nextRead = service.get();
    expect(nextRead.theme).toBe("dark");
    expect(nextRead.features.chat).toBe(true);
  });

  it("initializes the runtime config from the Nest config namespace", () => {
    const runtimeConfig: RuntimeConfigDto = {
      apiUrl: "https://api.example.test",
      websocketUrl: "wss://api.example.test",
      features: {
        traces: false,
        logs: false,
        chat: true,
      },
      theme: "light",
    };
    const { service, configService } = createService(runtimeConfig);

    expect(configService.get).toHaveBeenCalledWith("runtime", { infer: true });
    expect(service.get()).toEqual(runtimeConfig);
  });
});

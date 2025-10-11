import { Subject } from "rxjs";
import { describe, expect, it, vi } from "vitest";
import { RuntimeConfigDto } from "../../../src/runtime-config/dto/runtime-config.dto";
import { RuntimeConfigService } from "../../../src/runtime-config/runtime-config.service";
import type { RuntimeConfigStore } from "../../../src/runtime-config/runtime-config.store";

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

type ConfigServiceStub = { get: ReturnType<typeof vi.fn> };

function createStore(
  initial: RuntimeConfigDto
): {
  store: RuntimeConfigStore;
  changes$: Subject<RuntimeConfigDto>;
  snapshot: () => RuntimeConfigDto;
  setSnapshotSpy: ReturnType<typeof vi.fn>;
} {
  const changes$ = new Subject<RuntimeConfigDto>();
  let current = {
    ...initial,
    features: { ...initial.features },
  } satisfies RuntimeConfigDto;
  const setSnapshotSpy = vi.fn((config: RuntimeConfigDto) => {
    current = {
      ...config,
      features: { ...config.features },
    };
  });
  const store: RuntimeConfigStore = {
    changes$: changes$.asObservable(),
    setSnapshot: setSnapshotSpy,
    getSnapshot: vi.fn(() => ({
      ...current,
      features: { ...current.features },
    })),
  };
  return { store, changes$, snapshot: () => current, setSnapshotSpy };
}

function createService(runtimeConfig: RuntimeConfigDto = defaultRuntimeConfig) {
  const configService: ConfigServiceStub = {
    get: vi.fn((key: string) => {
      if (key === "runtime") {
        return runtimeConfig;
      }
      return undefined;
    }),
  };
  const { store, changes$, snapshot, setSnapshotSpy } = createStore(runtimeConfig);
  const service = new RuntimeConfigService(configService as never, store);

  return { service, configService, changes$, snapshot, setSnapshotSpy };
}

describe("RuntimeConfigService", () => {
  it("merges updates and writes them through the store", () => {
    const { service, setSnapshotSpy } = createService();

    const updated = service.update({ theme: "light" });

    expect(updated.theme).toBe("light");
    expect(setSnapshotSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: "light" })
    );
  });

  it("deep merges feature flags so unrelated defaults remain", () => {
    const { service, setSnapshotSpy } = createService();

    const updated = service.update({ features: { chat: false } });
    const expectedFeatures = {
      chat: false,
      logs: true,
      traces: true,
    } satisfies RuntimeConfigDto["features"];

    expect(updated.features).toEqual(expectedFeatures);
    expect(setSnapshotSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({ features: expectedFeatures })
    );
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

  it("maps store emissions to cloned payloads", () => {
    const { service, changes$ } = createService();
    const received: RuntimeConfigDto[] = [];

    const subscription = service.changes$.subscribe((config) => {
      received.push(config);
    });

    const nextConfig: RuntimeConfigDto = {
      apiUrl: "http://localhost:4000",
      websocketUrl: "ws://localhost:4000",
      features: {
        traces: false,
        logs: true,
        chat: true,
      },
      theme: "light",
    };

    changes$.next(nextConfig);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(nextConfig);
    expect(received[0]).not.toBe(nextConfig);

    subscription.unsubscribe();
  });
});

import "reflect-metadata";
import { ConfigStore } from "@eddie/config";
import type { ConfigService as EddieConfigService } from "@eddie/config";
import { Subject } from "rxjs";
import { WebSocket } from "ws";
import type { Server } from "ws";
import { describe, expect, it, vi } from "vitest";
import { ConfigHotReloadService } from "../../src/config-editor/config-hot-reload.service";
import { RuntimeConfigGateway } from "../../src/runtime-config/runtime-config.gateway";
import { RuntimeConfigService } from "../../src/runtime-config/runtime-config.service";
import type { RuntimeConfigDto } from "../../src/runtime-config/dto/runtime-config.dto";
import {
  createRuntimeConfigStore,
  type RuntimeConfigStore,
} from "../../src/runtime-config/runtime-config.store";

const createRuntimeConfig = (): RuntimeConfigDto => ({
  apiUrl: "http://localhost:3000",
  websocketUrl: "ws://localhost:3000",
  features: { traces: true, logs: true, chat: true },
  theme: "dark",
});

describe("RuntimeConfigGateway hot reload", () => {
  it("emits config.updated when the runtime config store updates", () => {
    const initial = createRuntimeConfig();
    const updated: RuntimeConfigDto = {
      ...initial,
      features: { ...initial.features, traces: false },
    };

    const changes$ = new Subject<RuntimeConfigDto>();
    let current = initial;
    const store: RuntimeConfigStore = {
      changes$: changes$.asObservable(),
      getSnapshot: vi.fn(() => current),
      setSnapshot: vi.fn((config: RuntimeConfigDto) => {
        current = {
          ...config,
          features: { ...config.features },
        };
      }),
    };

    const configService = {
      get: vi.fn((key: string) => (key === "runtime" ? initial : undefined)),
    };

    const service = new RuntimeConfigService(configService as never, store);
    const gateway = new RuntimeConfigGateway(service);

    const clientSend = vi.fn();
    const client = {
      readyState: WebSocket.OPEN,
      send: clientSend,
    } as unknown as WebSocket;
    const server = { clients: new Set([client]) } as unknown as Server;
    (gateway as { server: Server }).server = server;

    gateway.onModuleInit();

    changes$.next(updated);

    expect(clientSend).toHaveBeenCalledWith(
      JSON.stringify({ event: "config.updated", data: updated })
    );

    gateway.onModuleDestroy();
  });

  it("emits config.updated when hot reload updates the shared config store", async () => {
    const initial = createRuntimeConfig();

    const nestConfigService = {
      get: vi.fn((key: string) => (key === "runtime" ? initial : undefined)),
    };

    const configStore = new ConfigStore();
    const runtimeStore = createRuntimeConfigStore(configStore);
    const service = new RuntimeConfigService(
      nestConfigService as never,
      runtimeStore
    );
    const gateway = new RuntimeConfigGateway(service);

    const clientSend = vi.fn();
    const client = {
      readyState: WebSocket.OPEN,
      send: clientSend,
    } as unknown as WebSocket;
    const server = { clients: new Set([client]) } as unknown as Server;
    (gateway as { server: Server }).server = server;

    gateway.onModuleInit();
    clientSend.mockClear();

    const composeResult = { runtime: { theme: "light" } } as Record<string, unknown>;
    const configService: Pick<
      EddieConfigService,
      "parseSource" | "compose" | "writeSource"
    > = {
      parseSource: vi.fn(() => ({})),
      compose: vi.fn(async () => composeResult as never),
      writeSource: vi.fn(async () => ({
        path: null,
        format: "yaml",
        content: "runtime",
        input: {},
        config: composeResult as never,
      })),
    };

    const hotReloadService = new ConfigHotReloadService(
      configService as EddieConfigService,
      configStore
    );

    await hotReloadService.persist("runtime", "yaml");

    expect(clientSend).toHaveBeenCalledWith(
      JSON.stringify({ event: "config.updated", data: initial })
    );

    gateway.onModuleDestroy();
  });
});

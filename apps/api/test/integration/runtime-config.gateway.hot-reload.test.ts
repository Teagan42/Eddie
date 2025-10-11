import "reflect-metadata";
import { Subject } from "rxjs";
import { WebSocket } from "ws";
import type { Server } from "ws";
import { describe, expect, it, vi } from "vitest";
import { RuntimeConfigGateway } from "../../src/runtime-config/runtime-config.gateway";
import { RuntimeConfigService } from "../../src/runtime-config/runtime-config.service";
import type { RuntimeConfigDto } from "../../src/runtime-config/dto/runtime-config.dto";
import type { RuntimeConfigStore } from "../../src/runtime-config/runtime-config.store";

const createRuntimeConfig = (): RuntimeConfigDto => ({
  apiUrl: "http://localhost:3000",
  websocketUrl: "ws://localhost:3000",
  features: { traces: true },
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
});

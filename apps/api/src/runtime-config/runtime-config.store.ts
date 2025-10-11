import { ConfigStore } from "@eddie/config";
import type { Observable } from "rxjs";
import type { RuntimeConfigDto } from "./dto/runtime-config.dto";

export interface RuntimeConfigStore {
  readonly changes$: Observable<RuntimeConfigDto>;
  setSnapshot(config: RuntimeConfigDto): void;
  getSnapshot(): RuntimeConfigDto;
}

export const RUNTIME_CONFIG_STORE = Symbol("RUNTIME_CONFIG_STORE");

export function createRuntimeConfigStore(): RuntimeConfigStore {
  const store = new ConfigStore();
  return {
    changes$: store.changes$ as unknown as Observable<RuntimeConfigDto>,
    setSnapshot: (config: RuntimeConfigDto) => {
      store.setSnapshot(config as unknown as never);
    },
    getSnapshot: () => store.getSnapshot() as unknown as RuntimeConfigDto,
  };
}

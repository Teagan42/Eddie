import { ConfigStore } from "@eddie/config";
import { BehaviorSubject, Observable } from "rxjs";
import type { RuntimeConfigDto } from "./dto/runtime-config.dto";
import { runtimeDefaults } from "./runtime.config";

export interface RuntimeConfigStore {
  readonly changes$: Observable<RuntimeConfigDto>;
  setSnapshot(config: RuntimeConfigDto): void;
  getSnapshot(): RuntimeConfigDto;
}

export const RUNTIME_CONFIG_STORE = Symbol("RUNTIME_CONFIG_STORE");

export function createRuntimeConfigStore(
  configStore: ConfigStore
): RuntimeConfigStore {
  const subject = new BehaviorSubject<RuntimeConfigDto>(
    cloneRuntimeConfig(runtimeDefaults)
  );
  let snapshot = cloneRuntimeConfig(runtimeDefaults);
  let seeded = false;

  configStore.changes$.subscribe(() => {
    if (seeded) {
      subject.next(cloneRuntimeConfig(snapshot));
    }
  });

  return {
    changes$: subject.asObservable(),
    setSnapshot: (config: RuntimeConfigDto) => {
      snapshot = cloneRuntimeConfig(config);
      seeded = true;
      subject.next(cloneRuntimeConfig(snapshot));
    },
    getSnapshot: () => cloneRuntimeConfig(snapshot),
  };
}

export function cloneRuntimeConfig(config: RuntimeConfigDto): RuntimeConfigDto {
  return {
    ...config,
    features: { ...config.features },
  };
}

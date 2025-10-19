import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { map, Observable } from "rxjs";
import { RuntimeConfigDto } from "./dto/runtime-config.dto";
import { mergeRuntimeConfig, runtimeDefaults } from "./runtime.config";
import {
  RUNTIME_CONFIG_STORE,
  cloneRuntimeConfig,
  type RuntimeConfigStore,
} from "./runtime-config.store";

@Injectable()
export class RuntimeConfigService {
  readonly changes$: Observable<RuntimeConfigDto>;

  constructor(
    private readonly configService: ConfigService,
    @Inject(RUNTIME_CONFIG_STORE)
    private readonly store: RuntimeConfigStore
  ) {
    const configured = this.configService.get<RuntimeConfigDto>("runtime", {
      infer: true,
    });
    const initial = cloneRuntimeConfig(
      mergeRuntimeConfig(runtimeDefaults, configured ?? undefined)
    );
    this.store.setSnapshot(initial);
    this.changes$ = this.store.changes$.pipe(map(cloneRuntimeConfig));
  }

  get(): RuntimeConfigDto {
    return cloneRuntimeConfig(this.store.getSnapshot());
  }

  update(partial: Partial<RuntimeConfigDto>): RuntimeConfigDto {
    const merged = this.mergeConfig(this.store.getSnapshot(), partial);

    this.store.setSnapshot(merged);
    return cloneRuntimeConfig(merged);
  }

  seed(config: RuntimeConfigDto): void {
    const merged = mergeRuntimeConfig(runtimeDefaults, config);
    this.store.setSnapshot(cloneRuntimeConfig(merged));
  }

  private mergeConfig(
    current: RuntimeConfigDto,
    partial: Partial<RuntimeConfigDto>
  ): RuntimeConfigDto {
    const mergedFeatures =
      partial.features !== undefined
        ? { ...current.features, ...partial.features }
        : current.features;

    return {
      ...current,
      ...partial,
      features: mergedFeatures,
    };
  }
}

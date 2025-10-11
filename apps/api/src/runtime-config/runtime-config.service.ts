import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { map, Observable } from "rxjs";
import { RuntimeConfigDto } from "./dto/runtime-config.dto";
import { mergeRuntimeConfig, runtimeDefaults } from "./runtime.config";
import {
  RUNTIME_CONFIG_STORE,
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
    const initial = this.cloneConfig(
      mergeRuntimeConfig(runtimeDefaults, configured ?? undefined)
    );
    this.store.setSnapshot(initial);
    this.changes$ = this.store.changes$.pipe(map((config) => this.cloneConfig(config)));
  }

  get(): RuntimeConfigDto {
    return this.cloneConfig(this.store.getSnapshot());
  }

  update(partial: Partial<RuntimeConfigDto>): RuntimeConfigDto {
    const merged = this.mergeConfig(this.store.getSnapshot(), partial);

    this.store.setSnapshot(merged);
    return this.cloneConfig(merged);
  }

  private cloneConfig(config: RuntimeConfigDto): RuntimeConfigDto {
    return {
      ...config,
      features: { ...config.features },
    };
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

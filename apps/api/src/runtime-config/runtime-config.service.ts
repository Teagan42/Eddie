import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RuntimeConfigDto } from "./dto/runtime-config.dto";
import { mergeRuntimeConfig, runtimeDefaults } from "./runtime.config";

export interface RuntimeConfigListener {
  onConfigChanged(config: RuntimeConfigDto): void;
}

@Injectable()
export class RuntimeConfigService {
  private config: RuntimeConfigDto;

  private readonly listeners = new Set<RuntimeConfigListener>();

  constructor(private readonly configService: ConfigService) {
    const configured = this.configService.get<RuntimeConfigDto>("runtime", {
      infer: true,
    });
    this.config = this.cloneConfig(
      mergeRuntimeConfig(runtimeDefaults, configured ?? undefined)
    );
  }

  registerListener(listener: RuntimeConfigListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get(): RuntimeConfigDto {
    return this.cloneConfig(this.config);
  }

  update(partial: Partial<RuntimeConfigDto>): RuntimeConfigDto {
    const mergedFeatures =
      partial.features !== undefined
        ? { ...this.config.features, ...partial.features }
        : this.config.features;

    this.config = {
      ...this.config,
      ...partial,
      features: mergedFeatures,
    };
    const currentConfig = this.config;
    for (const listener of this.listeners) {
      listener.onConfigChanged(this.cloneConfig(currentConfig));
    }
    return this.cloneConfig(currentConfig);
  }

  private cloneConfig(config: RuntimeConfigDto): RuntimeConfigDto {
    return {
      ...config,
      features: { ...config.features },
    };
  }
}

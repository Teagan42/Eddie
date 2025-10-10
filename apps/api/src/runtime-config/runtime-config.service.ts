import { Injectable } from "@nestjs/common";
import { RuntimeConfigDto } from "./dto/runtime-config.dto";

export interface RuntimeConfigListener {
  onConfigChanged(config: RuntimeConfigDto): void;
}

@Injectable()
export class RuntimeConfigService {
  private config: RuntimeConfigDto = {
    apiUrl: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000",
    websocketUrl:
      process.env.NEXT_PUBLIC_WEBSOCKET_URL ?? "ws://localhost:3000",
    features: {
      traces: true,
      logs: true,
      chat: true,
    },
    theme: "dark",
  };

  private readonly listeners = new Set<RuntimeConfigListener>();

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

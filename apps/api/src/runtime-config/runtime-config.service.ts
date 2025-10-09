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
    return this.config;
  }

  update(partial: Partial<RuntimeConfigDto>): RuntimeConfigDto {
    this.config = { ...this.config, ...partial };
    for (const listener of this.listeners) {
      listener.onConfigChanged(this.config);
    }
    return this.config;
  }
}

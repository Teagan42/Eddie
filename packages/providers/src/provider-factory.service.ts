import { Inject, Injectable } from "@nestjs/common";
import type { ProviderConfig } from "@eddie/config";
import type { ProviderAdapter } from "@eddie/types";
import {
  PROVIDER_ADAPTER_FACTORIES,
  ProviderAdapterFactory,
} from "./provider.tokens";

/**
 * ProviderFactoryService creates a concrete provider adapter for the configured
 * provider name. It centralises adapter construction so dependency injection
 * consumers can request a single factory regardless of the underlying API.
 */
@Injectable()
export class ProviderFactoryService {
  constructor(
    @Inject(PROVIDER_ADAPTER_FACTORIES)
    private readonly factories: ProviderAdapterFactory[]
  ) {}

  create(config: ProviderConfig): ProviderAdapter {
    if (config.name === "noop") {
      return {
        name: "noop",
        async *stream() {
          yield { type: "error", message: "No provider configured" } as const;
        },
      };
    }

    const factory = this.factories.find(
      (candidate) => candidate.name === config.name
    );

    if (!factory) {
      throw new Error(`Unknown provider: ${config.name}`);
    }

    return factory.create(config);
  }

  async listModels(config: ProviderConfig): Promise<string[]> {
    if (config.name === "noop") {
      return [];
    }

    const factory = this.factories.find(
      (candidate) => candidate.name === config.name
    );

    if (!factory) {
      throw new Error(`Unknown provider: ${config.name}`);
    }

    return factory.listModels(config);
  }
}

import type { ProviderConfig } from "@eddie/config";
import type { ProviderAdapter } from "@eddie/types";

export interface ProviderAdapterFactory {
  readonly name: string;
  create(config: ProviderConfig): ProviderAdapter;
  listModels(config: ProviderConfig): Promise<string[]>;
}

/**
 * Provides the dependency injection token for provider adapter factories.
 * Expects an array of ProviderAdapterFactory implementations describing supported providers.
 * Typically injected into registration modules that compose ProviderAdapter services.
 */
export const PROVIDER_ADAPTER_FACTORIES = Symbol(
  "PROVIDER_ADAPTER_FACTORIES"
);

import type { ProviderAdapterFactory } from "@eddie/types";

/**
 * Provides the dependency injection token for provider adapter factories.
 * Expects an array of ProviderAdapterFactory implementations describing supported providers.
 * Typically injected into registration modules that compose ProviderAdapter services.
 */
export const PROVIDER_ADAPTER_FACTORIES = Symbol(
  "PROVIDER_ADAPTER_FACTORIES"
);

/**
 * Helper alias describing the expected dependency injection payload for
 * {@link PROVIDER_ADAPTER_FACTORIES} consumers.
 */
export type ProviderAdapterFactoryRegistry = ProviderAdapterFactory[];

import type { ProviderConfig } from "@eddie/config";
import type { ProviderAdapter } from "@eddie/types";

export interface ProviderAdapterFactory {
  readonly name: string;
  create(config: ProviderConfig): ProviderAdapter;
  listModels(config: ProviderConfig): Promise<string[]>;
}

export const PROVIDER_ADAPTER_FACTORIES = Symbol(
  "PROVIDER_ADAPTER_FACTORIES"
);

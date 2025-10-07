import type { ProviderConfig } from "../../config/types";
import type { ProviderAdapter } from "../types";

export interface ProviderAdapterFactory {
  readonly name: string;
  create(config: ProviderConfig): ProviderAdapter;
}

export const PROVIDER_ADAPTER_FACTORIES = Symbol(
  "PROVIDER_ADAPTER_FACTORIES"
);

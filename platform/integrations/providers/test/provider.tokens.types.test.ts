import { describe, expectTypeOf, it } from "vitest";

import { PROVIDER_ADAPTER_FACTORIES } from "../src/provider.tokens";
import type { ProviderAdapterFactoryRegistry } from "../src/provider.tokens";
import type { ProviderAdapterFactory } from "@eddie/types";

describe("PROVIDER_ADAPTER_FACTORIES token", () => {
  it("exposes registry type as array of provider factories", () => {
    expectTypeOf<ProviderAdapterFactoryRegistry>().toMatchTypeOf<
      ProviderAdapterFactory[]
    >([] as unknown as ProviderAdapterFactory[]);
    expectTypeOf<ProviderAdapterFactory[]>().toMatchTypeOf<
      ProviderAdapterFactoryRegistry
    >([] as unknown as ProviderAdapterFactoryRegistry);
  });

  it("is a symbol token", () => {
    expectTypeOf<typeof PROVIDER_ADAPTER_FACTORIES>().toMatchTypeOf<symbol>(
      Symbol("test")
    );
  });
});

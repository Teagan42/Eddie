import { describe, expect, it, expectTypeOf } from "vitest";
import {
  MEM0_CLIENT_TOKEN,
  MEM0_FACET_EXTRACTOR_TOKEN,
  MEM0_MEMORY_MODULE_OPTIONS_TOKEN,
  MEM0_VECTOR_STORE_TOKEN,
  Mem0MemoryModule,
  type Mem0MemoryModuleOptions,
} from "@eddie/memory";

describe("@eddie/memory public API", () => {
  it("exposes mem0 module and option tokens", () => {
    expect(Mem0MemoryModule).toBeDefined();
    expect(MEM0_MEMORY_MODULE_OPTIONS_TOKEN).toBeDefined();
    expect(MEM0_CLIENT_TOKEN).toBeDefined();
    expect(MEM0_FACET_EXTRACTOR_TOKEN).toBeDefined();
    expect(MEM0_VECTOR_STORE_TOKEN).toBeDefined();
  });

  it("re-exports module options type", () => {
    expectTypeOf<Mem0MemoryModuleOptions>().toMatchTypeOf<{
      credentials?: unknown;
    }>();
  });
});

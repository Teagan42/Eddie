import { MODULE_METADATA } from "@nestjs/common/constants";
import { CqrsModule } from "@nestjs/cqrs";
import { describe, expect, it } from "vitest";
import { ExecutionTreeModule } from "../../src/execution-tree/execution-tree.module";

function getModuleMetadata<T = unknown>(key: string): T[] {
  const metadata = Reflect.getMetadata(key, ExecutionTreeModule);
  return Array.isArray(metadata) ? metadata : [];
}

describe("ExecutionTreeModule", () => {
  it("imports CqrsModule to expose CQRS event bus", () => {
    const imports = getModuleMetadata(MODULE_METADATA.IMPORTS);

    expect(imports).toContain(CqrsModule);
  });
});

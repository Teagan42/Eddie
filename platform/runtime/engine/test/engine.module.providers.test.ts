import { describe, expect, it } from "vitest";
import { MODULE_METADATA } from "@nestjs/common/constants";
import {
  TEMPLATE_RUNTIME_LOGGER,
  TemplateRuntimeService,
  templateRuntimeProviders,
} from "@eddie/templates";
import { EngineModule } from "../src/engine.module";

function getMetadataArray<T = unknown>(key: string): T[] {
  const metadata = Reflect.getMetadata(key, EngineModule);
  return Array.isArray(metadata) ? metadata : [];
}

describe("EngineModule runtime providers", () => {
  it("reuses template runtime providers", () => {
    const providers = getMetadataArray(MODULE_METADATA.PROVIDERS);

    expect(providers).toEqual(
      expect.arrayContaining([
        ...templateRuntimeProviders,
        expect.objectContaining({ provide: TEMPLATE_RUNTIME_LOGGER }),
      ])
    );
  });

  it("exports template runtime service", () => {
    const exportsList = getMetadataArray(MODULE_METADATA.EXPORTS);

    expect(exportsList).toEqual(
      expect.arrayContaining([TemplateRuntimeService])
    );
  });
});

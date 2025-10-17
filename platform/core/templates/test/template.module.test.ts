import "reflect-metadata";
import { describe, expect, it } from "vitest";
import { MODULE_METADATA } from "@nestjs/common/constants";
import {
  TemplateModule,
  TemplateRendererService,
  TemplateRuntimeService,
} from "../src";
import { IoModule } from "@eddie/io";
import { getLoggerToken } from "@eddie/io";

function getMetadataArray<T = unknown>(key: string): T[] {
  const metadata = Reflect.getMetadata(key, TemplateModule);
  return Array.isArray(metadata) ? metadata : [];
}

describe("TemplateModule", () => {
  it("declares runtime and renderer services in providers", () => {
    const providers = getMetadataArray(MODULE_METADATA.PROVIDERS);

    expect(providers).toEqual(
      expect.arrayContaining([
        TemplateRendererService,
        TemplateRuntimeService,
        expect.objectContaining({
          provide: getLoggerToken("core:template:runtime"),
        }),
      ])
    );
  });

  it("exports runtime and renderer services", () => {
    const exportsList = getMetadataArray(MODULE_METADATA.EXPORTS);

    expect(exportsList).toEqual(
      expect.arrayContaining([
        TemplateRendererService,
        TemplateRuntimeService,
      ])
    );
  });

  it("imports IO dependencies for logging", () => {
    const imports = getMetadataArray(MODULE_METADATA.IMPORTS);

    expect(imports).toContain(IoModule);
  });
});

import { describe, expect, it } from "vitest";
import { MODULE_METADATA } from "@nestjs/common/constants";
import { getLoggerToken } from "@eddie/io";
import {
  TEMPLATE_RUNTIME_LOGGER_SCOPE,
  TemplateRuntimeService,
} from "@eddie/templates";
import { ContextModule } from "../src/context.module";

function getMetadataArray<T = unknown>(key: string): T[] {
  const metadata = Reflect.getMetadata(key, ContextModule);
  return Array.isArray(metadata) ? metadata : [];
}

describe("ContextModule", () => {
  it("provides runtime services from the templates package", () => {
    const providers = getMetadataArray(MODULE_METADATA.PROVIDERS);

    expect(providers).toEqual(
      expect.arrayContaining([
        TemplateRuntimeService,
        expect.objectContaining({
          provide: getLoggerToken(TEMPLATE_RUNTIME_LOGGER_SCOPE),
        }),
      ])
    );
  });
});

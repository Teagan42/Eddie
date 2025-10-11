import "reflect-metadata";

import { GLOBAL_MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { ConfigModule } from "../src/config.module";

describe("ConfigModule", () => {
  it("is marked as global for Nest consumers", () => {
    const isGlobal = Reflect.getMetadata(GLOBAL_MODULE_METADATA, ConfigModule);

    expect(isGlobal).toBe(true);
  });
});

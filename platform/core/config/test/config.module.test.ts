import "reflect-metadata";

import { GLOBAL_MODULE_METADATA } from "@nestjs/common/constants";
import { describe, expect, it } from "vitest";

import { ConfigModule } from "../src/config.module";
import { ConfigStore } from "../src/config.store";
import { Test } from "@nestjs/testing";

describe("ConfigModule", () => {
  it("is marked as global for Nest consumers", () => {
    const isGlobal = Reflect.getMetadata(GLOBAL_MODULE_METADATA, ConfigModule);

    expect(isGlobal).toBe(true);
  });

  it("loads CLI overrides during asynchronous registration", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.registerAsync({
          useFactory: async () => ({
            logLevel: "debug",
          }),
        }),
      ],
    }).compile();
    const store = moduleRef.get(ConfigStore);

    expect(store.getSnapshot().logLevel).toBe("debug");

    await moduleRef.close();
  });
});

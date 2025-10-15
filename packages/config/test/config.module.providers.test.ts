import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";

import { ConfigModule } from "../src/config.module";
import type { CliRuntimeOptions } from "../src/types";
import { ConfigValidator } from "../src/validation/config-validator";

const VALIDATOR_TOKEN = Symbol("validator-token");

describe("ConfigModule providers", () => {
  it("provides ConfigValidator for consumers", async () => {
    const runtimeOptions: CliRuntimeOptions = {};

    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.register(runtimeOptions)],
      providers: [
        {
          provide: VALIDATOR_TOKEN,
          useFactory: (validator: ConfigValidator) => validator,
          inject: [ConfigValidator],
        },
      ],
    }).compile();

    try {
      const validator = moduleRef.get<ConfigValidator>(VALIDATOR_TOKEN);
      expect(validator).toBeInstanceOf(ConfigValidator);
    } finally {
      await moduleRef.close();
    }
  });
});

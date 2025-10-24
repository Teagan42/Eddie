import { describe, expect, it } from "vitest";

import { resolveCliRuntimeOptionsFromEnv } from "../src/runtime-env";

describe("resolveCliRuntimeOptionsFromEnv", () => {
  it("extracts mem0 credentials", () => {
    const env = {
      EDDIE_CLI_MEM0_API_KEY: "env-key",
      EDDIE_CLI_MEM0_HOST: "https://mem0.example",
    } as NodeJS.ProcessEnv;

    const options = resolveCliRuntimeOptionsFromEnv(env);

    expect(options).toMatchObject({
      mem0ApiKey: "env-key",
      mem0Host: "https://mem0.example",
    });
  });
});

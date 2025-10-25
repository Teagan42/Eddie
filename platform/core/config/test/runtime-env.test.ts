import { describe, expect, it } from "vitest";

import { resolveCliRuntimeOptionsFromEnv } from "../src/runtime-env";

describe("resolveCliRuntimeOptionsFromEnv", () => {
  it("maps mem0 credentials from Eddie prefixed environment variables", () => {
    const options = resolveCliRuntimeOptionsFromEnv({
      EDDIE_MEM0_API_KEY: "api-key-123",
      EDDIE_MEM0_HOST: "https://mem0.example",
    });

    expect(options.mem0ApiKey).toBe("api-key-123");
    expect(options.mem0Host).toBe("https://mem0.example");
  });

  it("prefers CLI-specific mem0 environment variables when provided", () => {
    const options = resolveCliRuntimeOptionsFromEnv({
      EDDIE_MEM0_API_KEY: "api-key-123",
      EDDIE_MEM0_HOST: "https://mem0.example",
      EDDIE_CLI_MEM0_API_KEY: "cli-api-key-456",
      EDDIE_CLI_MEM0_HOST: "https://cli-mem0.example",
    });

    expect(options.mem0ApiKey).toBe("cli-api-key-456");
    expect(options.mem0Host).toBe("https://cli-mem0.example");
  });
});

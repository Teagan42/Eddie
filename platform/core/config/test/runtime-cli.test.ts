import { describe, expect, expectTypeOf, it } from "vitest";

import {
  CLI_BOOLEAN_OPTION_DEFINITIONS,
  CLI_VALUE_OPTION_DEFINITIONS,
} from "../src/runtime-cli-options";
import {
  mergeCliRuntimeOptions,
  parseCliRuntimeOptionsFromArgv,
} from "../src/runtime-cli";
import type { CliBooleanOptionRuntimeKey } from "../src/runtime-cli-options";
import type { CliRuntimeOptions } from "../src/types";

describe("mergeCliRuntimeOptions", () => {
  it("clones list properties from the base runtime options", () => {
    const base: CliRuntimeOptions = {
      context: ["src"],
      tools: ["lint"],
      disabledTools: ["format"],
    };

    const overrides: CliRuntimeOptions = {};

    const merged = mergeCliRuntimeOptions(base, overrides);

    expect(merged.context).toEqual(["src"]);
    expect(merged.tools).toEqual(["lint"]);
    expect(merged.disabledTools).toEqual(["format"]);

    expect(merged.context).not.toBe(base.context);
    expect(merged.tools).not.toBe(base.tools);
    expect(merged.disabledTools).not.toBe(base.disabledTools);
  });
});

describe("parseCliRuntimeOptionsFromArgv", () => {
  it("parses shared boolean flags into canonical runtime keys", () => {
    const argv = CLI_BOOLEAN_OPTION_DEFINITIONS.flatMap((definition) => [
      definition.keys[0],
    ]);

    const parsed = parseCliRuntimeOptionsFromArgv(argv);

    for (const definition of CLI_BOOLEAN_OPTION_DEFINITIONS) {
      expect(parsed[definition.runtimeKey]).toBe(true);
    }
  });

  it("parses shared value options according to their definition type", () => {
    const argv = CLI_VALUE_OPTION_DEFINITIONS.flatMap((definition) => {
      const [flag] = definition.keys;
      switch (definition.valueType) {
        case "list":
          return [flag, "alpha,beta"];
        case "logLevel":
          return [flag, "debug"];
        default:
          if (definition.runtimeKey === "metricsBackend") {
            return [flag, "logging"];
          }

          if (definition.runtimeKey === "metricsLoggingLevel") {
            return [flag, "verbose"];
          }

          return [flag, `${definition.runtimeKey}-value`];
      }
    });

    const parsed = parseCliRuntimeOptionsFromArgv(argv);

    for (const definition of CLI_VALUE_OPTION_DEFINITIONS) {
      const value = parsed[definition.runtimeKey];
      if (definition.valueType === "list") {
        expect(value).toEqual(["alpha", "beta"]);
        continue;
      }

      if (definition.runtimeKey === "logLevel") {
        expect(value).toBe("debug");
        continue;
      }

      if (definition.runtimeKey === "metricsBackend") {
        expect(value).toBe("logging");
        continue;
      }

      if (definition.runtimeKey === "metricsLoggingLevel") {
        expect(value).toBe("verbose");
        continue;
      }

      expect(value).toBe(`${definition.runtimeKey}-value`);
    }
  });

  it("parses mem0 credential overrides", () => {
    const parsed = parseCliRuntimeOptionsFromArgv([
      "--mem0-api-key",
      "cli-key",
      "--mem0-host",
      "https://mem0.example",
    ]);

    expect(parsed).toMatchObject({
      mem0ApiKey: "cli-key",
      mem0Host: "https://mem0.example",
    });
  });
});

describe("CLI option definitions", () => {
  it("derives boolean runtime option keys from the runtime options contract", () => {
    expectTypeOf<CliBooleanOptionRuntimeKey>().toEqualTypeOf<
      | "autoApprove"
      | "disableContext"
      | "disableSubagents"
      | "nonInteractive"
    >();
  });

  it("exposes all boolean runtime keys through shared metadata", () => {
    const runtimeKeys = CLI_BOOLEAN_OPTION_DEFINITIONS.map(
      (definition) => definition.runtimeKey,
    ).sort();

    expect(runtimeKeys).toEqual([
      "autoApprove",
      "disableContext",
      "disableSubagents",
      "nonInteractive",
    ]);
  });
});

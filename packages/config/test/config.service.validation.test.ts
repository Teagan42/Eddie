import { describe, expect, it } from "vitest";

import { ConfigService } from "../src/config.service";
import type { CliRuntimeOptions } from "../src/types";

describe("ConfigService validation aggregates issues", () => {
  it("collects multiple validation issues with a summary", async () => {
    const service = new ConfigService(
      undefined,
      {} as CliRuntimeOptions,
      undefined,
      null,
    );

    await expect(
      service.compose({
        tools: {
          sources: "not-an-array",
        } as any,
        providers: {
          invalid: {
            provider: {},
            model: " ",
          },
        },
        context: {
          resources: [
            {
              type: "bundle",
              id: "",
              include: "not-array",
            },
          ],
        } as any,
      }),
    ).rejects.toMatchObject({
      summary: expect.stringMatching(/configuration/i),
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: "tools.sources",
          message: expect.stringContaining("array"),
        }),
        expect.objectContaining({
          path: "providers.invalid.provider.name",
          message: expect.stringContaining("non-empty string"),
        }),
        expect.objectContaining({
          path: "providers.invalid.model",
          message: expect.stringContaining("non-empty string"),
        }),
        expect.objectContaining({
          path: "context.resources[0].id",
          message: expect.stringContaining("non-empty string"),
        }),
      ]),
    });
  });
});

import { describe, expect, it } from "vitest";
import * as providers from "../src";

describe("@eddie/providers exports", () => {
  it("exposes the LocalDockerModelRunnerAdapterFactory", () => {
    expect(providers.LocalDockerModelRunnerAdapterFactory).toBeDefined();
  });
});

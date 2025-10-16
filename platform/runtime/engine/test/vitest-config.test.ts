import { describe, expect, it } from "vitest";
import { createPackageVitestConfig } from "../.vitest.workspace.config";

const createConfig = () => createPackageVitestConfig("engine");

describe("createPackageVitestConfig", () => {
  it("limits coverage instrumentation to source files", () => {
    expect(createConfig().test?.coverage?.include).toEqual(["src/**/*.ts"]);
  });

  it("opts the workspace into threaded test pooling", () => {
    expect(createConfig().test?.pool).toBe("threads");
  });
});

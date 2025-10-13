import { describe, expect, it } from "vitest";
import { createPackageVitestConfig } from "../.vitest.workspace.config";

describe("createPackageVitestConfig", () => {
  it("limits coverage instrumentation to source files", () => {
    const config = createPackageVitestConfig("engine");

    expect(config.test?.coverage?.include).toEqual(["src/**/*.ts"]);
  });
});

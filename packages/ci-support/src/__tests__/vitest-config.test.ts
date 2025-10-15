import { describe, expect, it } from "vitest";
import config from "../../vitest.config";

describe("vitest config", () => {
  it("runs tests in parallel using the threads pool", () => {
    expect(config.test?.pool).toBe("threads");
  });
});

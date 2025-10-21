import config, {
  GLOBAL_COVERAGE_THRESHOLDS,
} from "../../../vitest.config";

describe("vitest config coverage thresholds", () => {
  it("defines global coverage thresholds for statements, branches, functions, and lines", () => {
    const thresholds = config.test?.coverage?.thresholds;

    expect(thresholds?.global).toEqual(GLOBAL_COVERAGE_THRESHOLDS);
  });
});

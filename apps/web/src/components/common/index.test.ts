import * as common from "./index";

describe("common component exports", () => {
  it("exposes the JsonTreeView component", () => {
    expect(common.JsonTreeView).toBeDefined();
  });
});

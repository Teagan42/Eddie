import { describe, expect, it } from "vitest";
import * as Engine from "../src";

describe("Engine public API", () => {
  it("no longer re-exports template runtime", () => {
    expect(Engine).not.toHaveProperty("TemplateRuntimeService");
  });
});

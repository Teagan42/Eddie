import { describe, expect, it } from "vitest";
import { cn } from "../lib/utils";


describe("vendor alias", () => {
  it("exposes cn utility from vendor namespace", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });
});

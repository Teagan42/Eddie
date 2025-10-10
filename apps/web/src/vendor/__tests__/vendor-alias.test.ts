import { describe, expect, it } from "vitest";

import { cn } from "@/vendor/lib/utils";

describe("vendor alias", () => {
  it("exposes cn utility from vendor namespace", () => {
    expect(cn("foo", "bar")).toBe("foo bar");
  });
});

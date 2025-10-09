import { describe, expect, it } from "vitest";

import { getSurfaceLayoutClasses } from "./surfaces";

describe("getSurfaceLayoutClasses", () => {
  it("returns cinematic layout for chat surface", () => {
    const classes = getSurfaceLayoutClasses("chat");

    expect(classes).toContain("rounded-[2.75rem]");
    expect(classes).toContain("bg-gradient-to-br");
    expect(classes).toContain(
      "shadow-[0_65px_120px_-60px_rgba(14,116,144,0.6)]"
    );
  });

  it("returns cinematic layout for config surface", () => {
    const classes = getSurfaceLayoutClasses("config");

    expect(classes).toContain("rounded-[2.75rem]");
    expect(classes).toContain("backdrop-blur-xl");
    expect(classes).toContain("border border-white/15");
  });
});

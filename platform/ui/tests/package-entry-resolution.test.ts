import { describe, expect, it } from "vitest";

const componentName = "Panel";

describe("@eddie/ui package entry", () => {
  it("exposes Panel when imported via the package name", async () => {
    const mod = await import("@eddie/ui");
    expect(mod).toHaveProperty(componentName);
    expect(typeof mod[componentName as keyof typeof mod]).toBe("function");
  });
});

import { describe, expect, it } from "vitest";
import { IoModule } from "../src/io.module";

describe("IoModule", () => {
  it("registers globally", () => {
    const moduleDefinition = IoModule.register();

    expect(moduleDefinition.global).toBe(true);
  });
});

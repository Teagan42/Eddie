import { describe, it, expect } from "vitest";

import { serializeError } from "./error-serialization.util";

describe("error-serialization.util", () => {
  it("captures message, stack, and cause from Error instances", () => {
    const cause = new Error("root cause");
    const error = new Error("boom", { cause });
    error.stack = "stack trace";

    const serialized = serializeError(error);

    expect(serialized).toEqual({
      message: "boom",
      stack: "stack trace",
      cause,
    });
  });

  it("stringifies unknown values", () => {
    expect(serializeError(undefined)).toEqual({ message: "undefined" });
    expect(serializeError(42)).toEqual({ message: "42" });
  });
});

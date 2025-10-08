import { trace, type Tracer } from "@opentelemetry/api";
import { afterEach, describe, expect, it, vi } from "vitest";

import { startSpan } from "../../../src/hooks/otel";

describe("otel hook", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("records attributes for all supported types", () => {
    const setAttribute = vi.fn();
    const end = vi.fn();
    const span = { setAttribute, end };
    const startSpanSpy = vi.fn(() => span);

    vi.spyOn(trace, "getTracer").mockReturnValue({
      startSpan: startSpanSpy,
    } as unknown as Tracer);

    const { record } = startSpan("test");

    record("string", "value");
    record("number", 42);
    record("boolean", true);
    record("array", ["a", "b"]);

    expect(setAttribute).toHaveBeenNthCalledWith(1, "string", "value");
    expect(setAttribute).toHaveBeenNthCalledWith(2, "number", 42);
    expect(setAttribute).toHaveBeenNthCalledWith(3, "boolean", true);
    expect(setAttribute).toHaveBeenNthCalledWith(4, "array", ["a", "b"]);
    expect(end).not.toHaveBeenCalled();
  });
});

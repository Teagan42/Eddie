import { describe, expect, it } from "vitest";

import { TracesService } from "../../../src/traces/traces.service";

describe("TracesService", () => {
  it("starts with no traces", () => {
    const service = new TracesService();

    expect(service.list()).toEqual([]);
  });
});

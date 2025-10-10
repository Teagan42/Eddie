import { describe, expect, it } from "vitest";
import { TracesService } from "../../../src/traces/traces.service";

describe("TracesService", () => {
  it("keeps stored metadata immutable across DTOs", () => {
    const service = new TracesService();
    const metadata = {
      stage: "ingest",
      nested: { value: 1 },
    } satisfies Record<string, unknown>;

    const created = service.create({
      name: "trace",
      metadata,
    });

    expect(created.metadata).not.toBe(metadata);

    const createdMetadata = created.metadata as {
      nested: { value: number };
    };
    createdMetadata.nested.value = 99;

    const fresh = service.get(created.id);

    expect(fresh.metadata).toEqual({ stage: "ingest", nested: { value: 1 } });
    expect(fresh.metadata).not.toBe(created.metadata);
  });
});

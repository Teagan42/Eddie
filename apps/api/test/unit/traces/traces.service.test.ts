import { BadRequestException } from "@nestjs/common";
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

  it("rejects circular metadata", () => {
    const service = new TracesService();
    const metadata: Record<string, unknown> = {};
    metadata.self = metadata;

    expect(() =>
      service.create({
        name: "circular",
        metadata,
      })
    ).toThrow(BadRequestException);
  });

  it("rejects excessively deep metadata", () => {
    const service = new TracesService();
    const root: Record<string, unknown> = {};
    let current = root;
    for (let index = 0; index < 1_200; index += 1) {
      const next: Record<string, unknown> = {};
      current.next = next;
      current = next;
    }

    expect(() =>
      service.create({
        name: "too-deep",
        metadata: root,
      })
    ).toThrow(BadRequestException);
  });
});

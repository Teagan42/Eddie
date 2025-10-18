import { describe, it, expect } from "vitest";

import type { PackedContext } from "@eddie/types";

import {
  createContextSnapshot,
  cloneContext,
  collectSelectedBundleIds,
} from "./context-snapshot.util";

describe("context-snapshot.util", () => {
  const baseContext: PackedContext = {
    files: [
      { path: "notes.md", bytes: 10, content: "hello" },
      { path: "draft.txt", bytes: 5, content: "draft" },
    ],
    totalBytes: 15,
    text: "hello draft",
    resources: [
      {
        id: "bundle-1",
        type: "bundle",
        text: "bundle text",
        files: [
          { path: "bundle.txt", bytes: 4, content: "data" },
        ],
      },
      {
        id: "template-1",
        type: "template",
        text: "template text",
      },
      {
        id: "",
        type: "bundle",
        text: "ignored bundle",
      },
    ],
  };

  it("clones context deeply and records selected bundle ids", () => {
    const { clone, bundleIds } = createContextSnapshot(baseContext);

    expect(bundleIds).toEqual(["bundle-1"]);
    expect(clone.selectedBundleIds).toEqual(["bundle-1"]);

    expect(clone).not.toBe(baseContext);
    expect(clone.files[0]).not.toBe(baseContext.files[0]);
    expect(clone.resources?.[0]).not.toBe(baseContext.resources?.[0]);
    expect(clone.resources?.[0]?.files?.[0]).not.toBe(
      baseContext.resources?.[0]?.files?.[0],
    );

    clone.files[0].content = "changed";
    if (clone.resources?.[0]?.files?.[0]) {
      clone.resources[0].files![0].content = "mutated";
    }

    expect(baseContext.files[0].content).toBe("hello");
    expect(baseContext.resources?.[0]?.files?.[0]?.content).toBe("data");
  });

  it("collects bundle ids directly without mutating context", () => {
    const bundleIds = collectSelectedBundleIds(baseContext);

    expect(bundleIds).toEqual(["bundle-1"]);
    expect(baseContext.resources?.[0]?.type).toBe("bundle");
  });

  it("cloneContext does not copy selectedBundleIds by default", () => {
    const clone = cloneContext({
      ...baseContext,
      resources: undefined,
    });

    expect(clone.selectedBundleIds).toBeUndefined();
    expect(clone.resources).toBeUndefined();
  });
});

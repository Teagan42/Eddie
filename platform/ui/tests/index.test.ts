import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import * as ui from "../src";

import * as chat from "../src/chat";
import * as common from "../src/common";
import * as layout from "../src/layout";
import * as navigation from "../src/navigation";
import * as overview from "../src/overview";

describe("@eddie/ui exports", () => {
  const packageJsonPath = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../package.json",
  );

  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

  it("exposes grouped layout, navigation, and common primitives", () => {
    expect(typeof common.Panel).toBe("function");
    expect(typeof common.AuroraBackground).toBe("function");
    expect(typeof common.JsonTreeView).toBe("function");
    expect(typeof layout.AppHeader).toBe("function");
    expect(typeof navigation.NavigationLink).toBe("function");
  });

  it("re-exports grouped primitives from the root barrel", () => {
    expect(ui.Panel).toBe(common.Panel);
    expect(ui.AuroraBackground).toBe(common.AuroraBackground);
    expect(ui.JsonTreeView).toBe(common.JsonTreeView);
    expect(ui.AppHeader).toBe(layout.AppHeader);
    expect(ui.NavigationLink).toBe(navigation.NavigationLink);
  });

  it("re-exports overview and chat surfaces from the root barrel", () => {
    expect(ui.ChatWindow).toBe(chat.ChatWindow);
    expect(ui.OverviewHero).toBe(overview.OverviewHero);
  });

  it("declares chat and overview subpath export maps", () => {
    const expectedSubpathExports = {
      "./overview": {
        types: "./dist/types/overview/index.d.ts",
        import: "./dist/esm/overview/index.js",
        require: "./dist/cjs/overview/index.js",
      },
      "./chat": {
        types: "./dist/types/chat/index.d.ts",
        import: "./dist/esm/chat/index.js",
        require: "./dist/cjs/chat/index.js",
      },
    } as const;

    for (const [subpath, expected] of Object.entries(expectedSubpathExports)) {
      expect(packageJson.exports[subpath as keyof typeof expectedSubpathExports]).toEqual(
        expected,
      );
    }
  });
});

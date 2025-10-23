import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { EddieThemeProvider } from "../src/theme/EddieThemeProvider";

const ThemeMock = vi.hoisted(() =>
  vi.fn((props: Record<string, unknown> & { children?: ReactNode }) => {
    return createElement("div", { "data-testid": "radix-theme" }, props.children);
  }),
) as Mock;

vi.mock("@radix-ui/themes", () => ({
  Theme: ThemeMock,
}));

describe("EddieThemeProvider", () => {
  beforeEach(() => {
    ThemeMock.mockClear();
    document.documentElement.dataset.theme = "light";
    document.documentElement.classList.remove("dark");
  });

  it("configures the Radix Theme accent color and appearance for the active theme", async () => {
    render(
      createElement(EddieThemeProvider, { theme: "midnight" }, createElement("div", { "data-testid": "content" })),
    );

    await waitFor(() => {
      expect(ThemeMock).toHaveBeenCalled();
    });

    const [props] = ThemeMock.mock.calls[0] as [Record<string, unknown>];

    expect(props).toMatchObject({
      accentColor: "iris",
      appearance: "dark",
      radius: "large",
    });
  });

  it("syncs the document root theme attributes", async () => {
    render(createElement(EddieThemeProvider, { theme: "aurora" }, createElement("div")));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("aurora");
    });

    expect(document.documentElement.classList.contains("dark")).toBe(false);

    render(createElement(EddieThemeProvider, { theme: "midnight" }, createElement("div")));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe("midnight");
    });

    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("packages aurora and midnight overrides in tokens.css", () => {
    const cssFile = readFileSync(resolve(__dirname, "../src/theme/tokens.css"), "utf8");

    expect(cssFile).toContain(':root[data-theme="aurora"]');
    expect(cssFile).toContain(':root[data-theme="midnight"]');
  });
});

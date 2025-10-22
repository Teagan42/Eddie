import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ContextBundlesPanel } from "../../src/chat/ContextBundlesPanel";
import { Theme } from "@radix-ui/themes";

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverMock,
});

describe("ContextBundlesPanel", () => {
  it("reveals bundle files when a bundle is expanded", async () => {
    const user = userEvent.setup();
    render(
      <Theme>
        <ContextBundlesPanel
          id="context-bundles"
          collapsed={false}
          onToggle={() => {}}
          bundles={[
            {
              id: "bundle-1",
              label: "Docs",
              summary: "Primary documentation",
              sizeBytes: 2048,
              fileCount: 2,
              files: [
                { path: "docs/README.md", sizeBytes: 1024 },
                { path: "docs/CONTRIBUTING.md", sizeBytes: 1024 },
              ],
            },
          ]}
        />
      </Theme>,
    );

    expect(screen.queryByText("docs/README.md")).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: "Toggle bundle Docs contents" }),
    );

    expect(await screen.findByText("docs/README.md")).toBeVisible();
    expect(screen.getByText("docs/CONTRIBUTING.md")).toBeVisible();
  });
});

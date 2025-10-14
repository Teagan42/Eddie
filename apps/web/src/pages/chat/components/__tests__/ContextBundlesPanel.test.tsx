import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TooltipProvider } from "@radix-ui/react-tooltip";
import type { OrchestratorContextBundleDto } from "@eddie/api-client";
import { ContextBundlesPanel } from "../ContextBundlesPanel";

class ResizeObserverMock {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  value: ResizeObserverMock,
});

describe("ContextBundlesPanel", () => {
  it("reveals bundle files when a bundle is opened", async () => {
    const user = userEvent.setup();
    const bundles: OrchestratorContextBundleDto[] = [
      {
        id: "bundle-1",
        label: "Source docs",
        summary: "Key technical documentation",
        sizeBytes: 2048,
        fileCount: 2,
        files: [
          { path: "docs/overview.md", sizeBytes: 1024 },
          { path: "docs/api/reference.md", sizeBytes: 512 },
        ],
      },
    ];

    render(
      <TooltipProvider>
        <ContextBundlesPanel
          panelId="context-bundles"
          bundles={bundles}
          collapsed={false}
          onToggle={() => {}}
        />
      </TooltipProvider>,
    );

    const toggle = screen.getByRole("button", { name: /view files for source docs/i });
    expect(toggle).toHaveAttribute("aria-expanded", "false");

    await user.click(toggle);

    const list = await screen.findByRole("list", { name: /files in source docs/i });
    const items = within(list).getAllByRole("listitem");

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("docs/overview.md");
    expect(items[1]).toHaveTextContent("docs/api/reference.md");
  });
});

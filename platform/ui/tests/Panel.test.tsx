import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { Panel } from "../src/common/Panel";

describe("Panel", () => {
  it("renders title, description, and children", () => {
    render(
      <Panel title="Example" description="An example panel">
        <span>Content</span>
      </Panel>
    );

    expect(screen.getByText("Example")).toBeInTheDocument();
    expect(screen.getByText("An example panel")).toBeInTheDocument();
    expect(screen.getByText("Content")).toBeInTheDocument();
  });

  it("does not constrain the content with a minimum height", () => {
    render(
      <Panel title="Example">
        <span>Content</span>
      </Panel>
    );

    const contentContainer = screen.getByText("Content").parentElement;

    expect(contentContainer).not.toHaveClass("min-h-[6rem]");
  });

  it("lets the content container size itself to its contents", () => {
    render(
      <Panel title="Example">
        <span>Content</span>
      </Panel>
    );

    const contentContainer = screen.getByText("Content").parentElement;

    expect(contentContainer).toHaveClass("h-auto");
  });

  it("toggles visibility of the content when collapsed and expanded", async () => {
    const user = userEvent.setup();

    render(
      <Panel title="Example">
        <span>Hidden content</span>
      </Panel>
    );

    const toggle = screen.getByRole("button", { name: /collapse panel/i });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Hidden content")).toBeVisible();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAccessibleName(/expand panel/i);
    expect(screen.queryByText("Hidden content")).not.toBeInTheDocument();

    await user.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Hidden content")).toBeVisible();
  });

  it("keeps actions inline with the header and aligned to the end", () => {
    render(
      <Panel title="Example" actions={<span data-testid="panel-actions">Actions</span>}>
        <span>Content</span>
      </Panel>
    );

    const actions = screen.getByTestId("panel-actions");
    const wrapper = actions.parentElement;
    const header = actions.closest("header");

    expect(header).toHaveClass("flex");
    expect(wrapper).toHaveClass("flex");
    expect(wrapper).toHaveClass("justify-end");
  });
});

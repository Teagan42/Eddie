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
});

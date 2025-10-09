import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Panel } from "./panel";

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
});

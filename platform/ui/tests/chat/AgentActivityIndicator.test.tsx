import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AgentActivityIndicator,
  type AgentActivityIndicatorProps,
} from "../../src/chat/AgentActivityIndicator";

const renderIndicator = (state: AgentActivityIndicatorProps["state"]) =>
  render(<AgentActivityIndicator state={state} />);

describe("AgentActivityIndicator", () => {
  it("renders nothing when idle", () => {
    const { container } = renderIndicator("idle");

    expect(container).toBeEmptyDOMElement();
  });

  it("announces the provided state", () => {
    renderIndicator("thinking");

    expect(
      screen.getByRole("status", { name: /agent is thinking/i })
    ).toBeInTheDocument();
  });

  it("renders tool error messaging", () => {
    renderIndicator('tool-error' as AgentActivityIndicatorProps["state"]);

    expect(
      screen.getByRole("status", { name: /tool invocation failed/i })
    ).toBeInTheDocument();
  });
});

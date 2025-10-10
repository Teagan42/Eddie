import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { NavigationLink } from "./NavigationLink";

const renderWithRouter = (ui: ReactNode, initialPath: string) =>
  render(<MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>);

describe("NavigationLink", () => {
  it("marks the link as current when the route matches", () => {
    renderWithRouter(<NavigationLink to="/chat" label="Chat" />, "/chat");

    expect(screen.getByRole("link", { name: /Chat/i })).toHaveAttribute("aria-current", "page");
  });

  it("omits aria-current when the route does not match", () => {
    renderWithRouter(<NavigationLink to="/chat" label="Chat" />, "/config");

    expect(screen.getByRole("link", { name: /Chat/i })).not.toHaveAttribute("aria-current");
  });
});

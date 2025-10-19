import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { NavigationLink } from "./NavigationLink";

const renderWithRouter = (ui: ReactNode, initialPath: string) =>
  render(<MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>);

const renderChatLinkAt = (initialPath: string) =>
  renderWithRouter(<NavigationLink to="/chat" label="Chat" />, initialPath);

describe("NavigationLink", () => {
  it("marks the link as current when the route matches", () => {
    renderChatLinkAt("/chat");

    expect(screen.getByRole("link", { name: /Chat/i })).toHaveAttribute("aria-current", "page");
  });

  it("omits aria-current when the route does not match", () => {
    renderChatLinkAt("/config");

    expect(screen.getByRole("link", { name: /Chat/i })).not.toHaveAttribute("aria-current");
  });

  it("does not display an active status badge", () => {
    renderChatLinkAt("/chat");

    expect(screen.queryByText(/Active/i)).not.toBeInTheDocument();
  });
});

import { describe, expect, expectTypeOf, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";

import { NavigationLink } from "../src/navigation/NavigationLink";
import type { NavigationLinkProps } from "../src/navigation/NavigationLink";

describe("NavigationLink", () => {
  it("marks the current route as active", () => {
    render(
      <MemoryRouter initialEntries={["/current"]}>
        <NavigationLink to="/current" label="Current" />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Current" })).toHaveAttribute("aria-current", "page");
  });

  it("renders an inactive link for other routes", () => {
    render(
      <MemoryRouter initialEntries={["/different"]}>
        <NavigationLink to="/current" label="Current" />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Current" })).not.toHaveAttribute("aria-current");
  });

  it("merges additional class names with the base styles", () => {
    render(
      <MemoryRouter initialEntries={["/current"]}>
        <NavigationLink
          to="/current"
          label="Current"
          className="custom-class"
        />
      </MemoryRouter>
    );

    expect(screen.getByRole("link", { name: "Current" })).toHaveClass("custom-class");
  });

  it("exposes an optional className prop in the public types", () => {
    expectTypeOf<NavigationLinkProps>().toMatchTypeOf<{ className?: string }>();
  });
});

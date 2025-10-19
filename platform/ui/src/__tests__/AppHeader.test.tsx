import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AppHeader } from "../layout/AppHeader";
import type { AppHeaderProps } from "../layout/AppHeader";

const navigation: AppHeaderProps["navigation"] = [
  { to: "/", label: "Overview" },
  { to: "/chat", label: "Chat" },
  { to: "/config", label: "Config" },
];

const renderHeader = (props: Partial<AppHeaderProps> = {}, initialPath = "/") =>
  render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppHeader
        apiConnected={props.apiConnected ?? false}
        onClearApiKey={props.onClearApiKey ?? vi.fn()}
        navigation={props.navigation ?? navigation}
        addApiKeyHref={props.addApiKeyHref}
      />
    </MemoryRouter>
  );

describe("AppHeader", () => {
  it("highlights the navigation item for the current route", () => {
    renderHeader({}, "/chat");

    expect(screen.getByRole("link", { name: /Chat/i })).toHaveAttribute("aria-current", "page");
  });

  it("shows awaiting key status when not connected", () => {
    renderHeader({ apiConnected: false });

    expect(screen.getByText("Awaiting key")).toBeInTheDocument();
  });

  it("calls the clear key callback when the button is pressed", async () => {
    const user = userEvent.setup();
    const onClearApiKey = vi.fn();

    renderHeader({ apiConnected: true, onClearApiKey });

    await user.click(screen.getByRole("button", { name: "Clear API key" }));

    expect(onClearApiKey).toHaveBeenCalledTimes(1);
  });
});

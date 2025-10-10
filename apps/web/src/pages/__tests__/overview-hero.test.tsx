import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { OverviewHero } from "../components";

describe("OverviewHero", () => {
  it("renders mission copy and triggers theme toggle", async () => {
    const user = userEvent.setup();
    const handleToggleTheme = vi.fn();
    const DummyIcon = ({ className }: { className?: string }) => <span data-testid="dummy-icon" className={className} />;

    render(
      <MemoryRouter>
        <OverviewHero
          apiKey="demo"
          apiUrl="https://api.example.com"
          onRemoveApiKey={vi.fn()}
          onToggleTheme={handleToggleTheme}
          stats={[
            {
              label: "Stat",
              value: 1,
              hint: "Hint",
              icon: DummyIcon,
            },
          ]}
        />
      </MemoryRouter>
    );

    expect(
      screen.getByRole("heading", { name: /operate your agentic fleet with cinematic clarity/i })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /observe sessions, traces, and logs at a glance while keeping configuration and api credentials at your fingertips/i
      )
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cycle theme/i }));

    expect(handleToggleTheme).toHaveBeenCalledTimes(1);
  });
});

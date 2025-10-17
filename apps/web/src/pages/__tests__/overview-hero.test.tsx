import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { RuntimeConfigDto } from "@eddie/api-client";
import { OverviewHero } from "../components";
import { ThemeProvider, useTheme } from "@/theme";

vi.mock("@/api/api-provider", () => ({
  useApi: () => ({
    http: {
      config: {
        get: vi.fn(() => Promise.resolve({ theme: initialTheme } satisfies Pick<RuntimeConfigDto, "theme">)),
        update: vi.fn((input: Partial<RuntimeConfigDto>) => Promise.resolve({ theme: input.theme })),
      },
    },
  }),
}));

let initialTheme: RuntimeConfigDto["theme"] = "light";

function ThemeHarness(): JSX.Element {
  const { theme, setTheme } = useTheme();
  const handleToggleTheme = (): void => {
    const nextTheme = (theme === "dark" ? "light" : "dark") as RuntimeConfigDto["theme"];
    setTheme(nextTheme);
  };

  return (
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
            icon: ({ className }: { className?: string }) => <span data-testid="dummy-icon" className={className} />,
          },
        ]}
      />
    </MemoryRouter>
  );
}

describe("OverviewHero", () => {
  it("cycles the theme via provider when button clicked", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ThemeHarness />
        </ThemeProvider>
      </QueryClientProvider>
    );

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(false));

    await user.click(screen.getByRole("button", { name: /cycle theme/i }));

    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));

    queryClient.clear();
  });
});

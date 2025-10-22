import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AVAILABLE_THEMES, ThemeProvider, useTheme } from "../../src/overview/theme";

vi.mock("../../src/overview/api", () => {
  const config = {
    get: vi.fn(async () => ({ theme: AVAILABLE_THEMES[0] })),
    update: vi.fn(async ({ theme }: { theme?: (typeof AVAILABLE_THEMES)[number] }) => ({
      theme: theme ?? AVAILABLE_THEMES[0],
    })),
  };

  return {
    useOverviewApi: () => ({
      http: {
        config,
      },
    }),
  };
});

function ThemeHarness(): JSX.Element {
  const { theme, setTheme } = useTheme();

  return (
    <div>
      <span role="status" aria-live="polite">
        {theme}
      </span>
      <ul>
        {AVAILABLE_THEMES.map((name) => (
          <li key={name}>
            <button type="button" onClick={() => setTheme(name)}>
              set {name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

describe("overview theme provider", () => {
  it("applies data-theme attribute and toggles dark class", async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    render(
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <ThemeHarness />
        </ThemeProvider>
      </QueryClientProvider>,
    );

    const status = await screen.findByRole("status");
    const toggleButtons = await screen.findAllByRole("button", { name: /set/i });

    expect(AVAILABLE_THEMES.length).toBeGreaterThan(0);
    await waitFor(() => expect(status).toHaveTextContent(AVAILABLE_THEMES[0] ?? ""));
    await waitFor(() =>
      expect(document.documentElement.dataset.theme).toBe(AVAILABLE_THEMES[0] ?? ""),
    );

    const midnightToggle = toggleButtons.at(-1);
    if (!midnightToggle) {
      throw new Error("expected at least one toggle button");
    }

    await user.click(midnightToggle);

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe(status.textContent));
    await waitFor(() => {
      const expectedDark = status.textContent === "dark" || status.textContent === "midnight";
      expect(document.documentElement.classList.contains("dark")).toBe(expectedDark);
    });

    queryClient.clear();
  });
});

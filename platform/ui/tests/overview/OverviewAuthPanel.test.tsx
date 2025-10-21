import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { OverviewAuthPanel } from "../../src/overview";

describe("OverviewAuthPanel", () => {
  it("renders metadata and updates API key on change", async () => {
    const handleApiKeyChange = vi.fn();
    const user = userEvent.setup();

    render(<OverviewAuthPanel apiKey="demo" onApiKeyChange={handleApiKeyChange} />);

    expect(
      screen.getByRole("heading", { name: /authentication/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/provide an eddie api key to unlock administrative surfaces/i),
    ).toBeInTheDocument();
    const badge = screen.getByText(/secure & local only/i);
    expect(badge.className).toContain("hero-badge");

    const input = screen.getByPlaceholderText(/enter api key/i) as HTMLInputElement;
    expect(input.value).toBe("demo");

    await user.clear(input);
    expect(handleApiKeyChange).toHaveBeenLastCalledWith(null);

    await user.type(input, "next-key");
    expect(handleApiKeyChange).toHaveBeenLastCalledWith("next-key");
  });
});

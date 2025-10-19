import { act } from "react";
import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Panel } from "./Panel";

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

  it("does not constrain the content with a minimum height", () => {
    render(
      <Panel title="Example">
        <span>Content</span>
      </Panel>
    );

    const contentContainer = screen.getByText("Content").parentElement;

    expect(contentContainer).not.toHaveClass("min-h-[6rem]");
  });

  it("indicates when the browser is offline", () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", {
      value: false,
      configurable: true,
    });

    render(
      <Panel title="Example">
        <span>Content</span>
      </Panel>
    );

    expect(screen.getByText("Offline Surface")).toBeInTheDocument();

    if (original) {
      Object.defineProperty(window.navigator, "onLine", original);
    }
  });

  it("updates the status indicator when connectivity changes", async () => {
    const original = Object.getOwnPropertyDescriptor(window.navigator, "onLine");
    Object.defineProperty(window.navigator, "onLine", {
      value: true,
      configurable: true,
    });

    render(
      <Panel title="Example">
        <span>Content</span>
      </Panel>
    );

    expect(screen.getByText("Live Surface")).toBeInTheDocument();

    Object.defineProperty(window.navigator, "onLine", {
      value: false,
    });

    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });

    await waitFor(() => {
      expect(screen.getByText("Offline Surface")).toBeInTheDocument();
    });

    Object.defineProperty(window.navigator, "onLine", {
      value: true,
    });

    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    await waitFor(() => {
      expect(screen.getByText("Live Surface")).toBeInTheDocument();
    });

    if (original) {
      Object.defineProperty(window.navigator, "onLine", original);
    }
  });
});

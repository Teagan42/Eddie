import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { JsonTreeView } from "../common/JsonTreeView";

describe("JsonTreeView", () => {
  it("reveals nested child entries after expanding a parent node", async () => {
    const user = userEvent.setup();

    render(
      <JsonTreeView
        value={{
          parent: {
            child: "value",
          },
        }}
      />
    );

    expect(screen.queryByTestId("json-entry-parent.child")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Toggle parent" }));

    expect(screen.getByTestId("json-entry-parent.child")).toHaveTextContent('"child"');
    expect(screen.getByTestId("json-entry-parent.child")).toHaveTextContent('"value"');
  });

  it("formats primitive root values with consistent styling", () => {
    render(<JsonTreeView value="hello" />);

    const primitive = screen.getByTestId("json-entry-root");
    expect(primitive).toHaveTextContent('"hello"');
    expect(primitive).toHaveAttribute("data-type", "string");
  });

  it("expands entries when collapse defaults are disabled", () => {
    render(
      <JsonTreeView
        collapsedByDefault={false}
        value={{
          toggled: {
            nested: 1,
          },
        }}
      />
    );

    expect(
      screen.getByRole("button", { name: "Toggle toggled" })
    ).toHaveAttribute("aria-expanded", "true");
    const expandedEntry = screen
      .getAllByTestId("json-entry-toggled")
      .find((node) => node.tagName === "LI");
    expect(expandedEntry).toHaveAttribute("data-state", "expanded");
    expect(screen.getByTestId("json-entry-toggled.nested")).toHaveTextContent(
      '"nested"'
    );
  });

  it("associates an optional root label with the rendered tree", () => {
    render(
      <JsonTreeView
        rootLabel="Tool Response"
        value={{
          result: true,
        }}
      />
    );

    const label = screen.getByTestId("json-tree-view-root-label");
    expect(label).toHaveTextContent("Tool Response");

    const tree = screen.getByTestId("json-tree-view");
    expect(tree).toHaveAttribute("aria-labelledby", label.id);
  });
});

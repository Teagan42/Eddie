import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { JsonExplorer } from "./JsonExplorer";

describe("JsonExplorer", () => {
  it("reveals nested object entries when expanded", async () => {
    const user = userEvent.setup();

    render(
      <JsonExplorer
        value={{
          foo: {
            bar: 1,
          },
        }}
      />
    );

    expect(screen.queryByTestId("json-entry-foo.bar")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Toggle foo" }));

    expect(screen.getByTestId("json-entry-foo.bar")).toHaveTextContent(
      '"bar"'
    );
    expect(screen.getByTestId("json-entry-foo.bar")).toHaveTextContent("1");
  });
});

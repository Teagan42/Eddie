import { render, screen } from "@testing-library/react";
import { describe, it } from "vitest";

import { MessageComposer } from "./MessageComposer";

describe("MessageComposer", () => {
  const noop = () => {};

  it("shows keyboard hint when interaction is allowed", () => {
    render(
      <MessageComposer
        disabled={false}
        value=""
        onChange={noop}
        onSubmit={noop}
      />,
    );

    expect(screen.getByText(/press enter or click send/i)).toBeInTheDocument();
  });

  it("announces sending state when disabled", () => {
    render(
      <MessageComposer
        disabled={true}
        value=""
        onChange={noop}
        onSubmit={noop}
      />,
    );

    expect(screen.getByText(/sending in progress/i)).toBeInTheDocument();
    expect(screen.queryByText(/press enter or click send/i)).toBeNull();
  });
});

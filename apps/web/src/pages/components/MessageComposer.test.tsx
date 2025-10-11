import { fireEvent, render, screen } from "@testing-library/react";
import { describe, it, vi } from "vitest";

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

  it("does not submit when Enter is pressed without modifiers", () => {
    const handleSubmit = vi.fn((event) => event.preventDefault());

    render(
      <MessageComposer
        disabled={false}
        value=""
        onChange={noop}
        onSubmit={handleSubmit}
      />,
    );

    const textArea = screen.getByPlaceholderText(/send a message/i);

    fireEvent.keyDown(textArea, { key: "Enter" });

    expect(handleSubmit).not.toHaveBeenCalled();
  });

  it("submits when Enter is pressed with a modifier", () => {
    const handleSubmit = vi.fn((event) => event.preventDefault());

    render(
      <MessageComposer
        disabled={false}
        value=""
        onChange={noop}
        onSubmit={handleSubmit}
      />,
    );

    const textArea = screen.getByPlaceholderText(/send a message/i);

    fireEvent.keyDown(textArea, { key: "Enter", metaKey: true });

    expect(handleSubmit).toHaveBeenCalledTimes(1);
  });
});

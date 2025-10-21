import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, it, vi } from "vitest";

import { MessageComposer } from "../../src/chat";

describe("MessageComposer", () => {
  const noop = () => {};
  const sendHintCopy = /press alt\+enter or click send/i;

  it("shows keyboard hint when interaction is allowed", () => {
    render(
      <MessageComposer
        disabled={false}
        value=""
        onChange={noop}
        onSubmit={noop}
      />,
    );

    expect(screen.getByText(sendHintCopy)).toBeInTheDocument();
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
    expect(screen.queryByText(sendHintCopy)).toBeNull();
  });

  it("does not submit when Enter is pressed without modifiers", () => {
    const handleSubmit = vi.fn();

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
    const handleSubmit = vi.fn();

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
    expect(handleSubmit).toHaveBeenCalledWith();
  });

  it("submits when Enter is pressed with the Alt modifier", () => {
    const handleSubmit = vi.fn();

    render(
      <MessageComposer
        disabled={false}
        value=""
        onChange={noop}
        onSubmit={handleSubmit}
      />,
    );

    const textArea = screen.getByPlaceholderText(/send a message/i);

    fireEvent.keyDown(textArea, { key: "Unidentified", code: "Enter", altKey: true });

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith();

    handleSubmit.mockClear();

    fireEvent.keyDown(textArea, { key: "Enter", altKey: true });

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith();
  });

  it("submits when the Send button is clicked", async () => {
    const handleSubmit = vi.fn();
    const user = userEvent.setup();

    render(
      <MessageComposer
        disabled={false}
        value="Hello"
        onChange={noop}
        onSubmit={handleSubmit}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Send" }));

    expect(handleSubmit).toHaveBeenCalledTimes(1);
    expect(handleSubmit).toHaveBeenCalledWith();
  });

  it("notifies consumers when the textarea value changes", () => {
    const handleChange = vi.fn();

    render(
      <MessageComposer
        disabled={false}
        value="Hello"
        onChange={handleChange}
        onSubmit={noop}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText(/send a message/i), {
      target: { value: "Updated" },
    });

    expect(handleChange).toHaveBeenCalledWith("Updated");
  });

  it("allows customizing the placeholder copy", () => {
    render(
      <MessageComposer
        disabled={false}
        value=""
        onChange={noop}
        onSubmit={noop}
        placeholder="Send a message to the orchestrator"
      />,
    );

    expect(
      screen.getByPlaceholderText("Send a message to the orchestrator"),
    ).toBeInTheDocument();
  });

  it("can disable submissions while leaving the composer interactive", () => {
    render(
      <MessageComposer
        disabled={false}
        value="Hello"
        onChange={noop}
        onSubmit={noop}
        submitDisabled={true}
      />,
    );

    const textarea = screen.getByPlaceholderText(/send a message/i);
    expect(textarea).not.toBeDisabled();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });
});

import type { FormEventHandler } from "react";
import { Button, Flex, TextArea } from "@radix-ui/themes";
import { PaperPlaneIcon } from "@radix-ui/react-icons";

export interface MessageComposerProps {
  disabled: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export function MessageComposer({ disabled, value, onChange, onSubmit }: MessageComposerProps): JSX.Element {
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3">
      <TextArea
        placeholder="Send a message"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        rows={3}
        className="rounded-2xl border border-white/15 bg-white/12"
      />
      <Flex gap="2" justify="end">
        <Button
          type="submit"
          size="3"
          disabled={disabled}
          className="bg-gradient-to-r from-emerald-400 via-emerald-500 to-sky-500 text-white"
        >
          <PaperPlaneIcon /> Send
        </Button>
      </Flex>
    </form>
  );
}

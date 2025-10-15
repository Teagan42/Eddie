import type { FormEventHandler, KeyboardEvent } from "react";
import { Button, Flex, Text, TextArea } from "@radix-ui/themes";
import { PaperPlaneIcon } from "@radix-ui/react-icons";

export interface MessageComposerProps {
  disabled: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export function MessageComposer({ disabled, value, onChange, onSubmit }: MessageComposerProps): JSX.Element {
  const hintMessage = disabled ? "Sending in progress..." : "Press Enter or click Send";
  const glowClasses = [
    "pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-emerald-400/30 blur-3xl",
    "pointer-events-none absolute -bottom-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-sky-500/20 blur-3xl",
  ];

  const submitForm = (form: HTMLFormElement) => {
    if (typeof form.requestSubmit === "function") {
      form.requestSubmit();

      return;
    }

    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const isEnterKey = event.key === "Enter" || ["Enter", "NumpadEnter"].includes(event.code);

    if (!isEnterKey) {
      return;
    }

    const hasModifier = event.metaKey || event.ctrlKey || event.altKey;

    if (!hasModifier) {
      return;
    }

    event.preventDefault();

    if (disabled) {
      return;
    }

    const form = event.currentTarget.form;

    if (!form) {
      return;
    }

    submitForm(form);
  };

  return (
    <form
      onSubmit={onSubmit}
      className="relative overflow-hidden rounded-3xl border border-white/10 bg-slate-950/70 p-4 shadow-[0_20px_60px_-30px_rgba(16,185,129,0.9)] backdrop-blur"
    >
      {glowClasses.map((className, index) => (
        <span key={index} className={className} />
      ))}
      <Flex direction="column" gap="3" className="relative z-10">
        <div className="rounded-2xl border border-white/10 bg-white/5 p-1">
          <TextArea
            placeholder="Send a message"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={3}
            variant="soft"
            className="bg-transparent text-base leading-relaxed"
          />
        </div>
        <Flex align="center" justify="between" gap="3">
          <Text
            size="2"
            color={disabled ? "gray" : "mint"}
            className="font-medium tracking-wide"
            aria-live="polite"
          >
            {hintMessage}
          </Text>
          <Button
            type="submit"
            size="3"
            disabled={disabled}
            className="group relative overflow-hidden rounded-full bg-gradient-to-r from-emerald-400 via-emerald-500 to-sky-500 text-white shadow-[0_10px_30px_-12px_rgba(14,165,233,0.8)] transition-transform duration-150 ease-out hover:scale-[1.02]"
          >
            <span className="absolute inset-0 bg-white/15 opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100" />
            <span className="relative flex items-center gap-2">
              <PaperPlaneIcon />
              <span>Send</span>
            </span>
          </Button>
        </Flex>
      </Flex>
    </form>
  );
}

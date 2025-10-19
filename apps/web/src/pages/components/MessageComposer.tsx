import type { FormEventHandler, KeyboardEvent } from "react";
import { Button, Flex, Text, TextArea } from "@radix-ui/themes";
import { PaperPlaneIcon } from "@radix-ui/react-icons";

const COMPOSER_FORM_CLASS = [
  "relative overflow-hidden rounded-3xl border p-4 backdrop-blur",
  "border-[color:var(--overview-composer-border)]",
  "bg-[color:var(--overview-composer-bg)]",
  "shadow-[var(--overview-composer-shadow)]",
].join(" ");

const COMPOSER_GLOW_CLASSES = [
  "pointer-events-none absolute -right-6 -top-8 h-32 w-32 rounded-full bg-[color:var(--overview-composer-glow-primary)] blur-3xl",
  "pointer-events-none absolute -bottom-10 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-[color:var(--overview-composer-glow-secondary)] blur-3xl",
] as const;

const COMPOSER_FIELD_CLASS = [
  "rounded-2xl border p-1",
  "border-[color:var(--overview-composer-input-border)]",
  "bg-[color:var(--overview-composer-input-bg)]",
].join(" ");

const COMPOSER_TEXTAREA_CLASS = "bg-transparent text-base leading-relaxed text-[color:var(--overview-panel-foreground)]";

const HINT_ACTIVE_CLASS = "font-medium tracking-wide text-[color:var(--overview-composer-hint-active)]";
const HINT_DISABLED_CLASS = "font-medium tracking-wide text-[color:var(--overview-composer-hint-disabled)]";

const CTA_BUTTON_CLASS = [
  "group relative overflow-hidden rounded-full",
  "bg-gradient-to-r",
  "from-[hsl(var(--hero-cta-from))] via-[hsl(var(--hero-cta-via))] to-[hsl(var(--hero-cta-to))]",
  "text-[color:var(--hero-cta-foreground)]",
  "shadow-[var(--hero-cta-shadow)]",
  "dark:from-[hsl(var(--hero-cta-from-dark))] dark:via-[hsl(var(--hero-cta-via-dark))] dark:to-[hsl(var(--hero-cta-to-dark))]",
  "dark:text-[color:var(--hero-cta-foreground-dark)]",
  "dark:shadow-[var(--hero-cta-shadow-dark)]",
].join(" ");

const CTA_SHINE_CLASS =
  "absolute inset-0 bg-[color:var(--overview-composer-cta-shine)] opacity-0 transition-opacity duration-150 ease-out group-hover:opacity-100";
const CTA_CONTENT_CLASS =
  "relative flex items-center gap-2 text-[color:var(--overview-composer-cta-foreground)]";

export interface MessageComposerProps {
  disabled: boolean;
  value: string;
  onChange: (value: string) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  placeholder?: string;
  submitDisabled?: boolean;
}

export function MessageComposer({
  disabled,
  value,
  onChange,
  onSubmit,
  placeholder = "Send a message",
  submitDisabled = false,
}: MessageComposerProps): JSX.Element {
  const hintMessage = disabled ? "Sending in progress..." : "Press Alt+Enter or click Send";
  const isSubmitDisabled = disabled || submitDisabled;
  const hintClassName = disabled ? HINT_DISABLED_CLASS : HINT_ACTIVE_CLASS;

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

    if (disabled || submitDisabled) {
      return;
    }

    const form = event.currentTarget.form;

    if (!form) {
      return;
    }

    submitForm(form);
  };

  return (
    <form onSubmit={onSubmit} className={COMPOSER_FORM_CLASS}>
      {COMPOSER_GLOW_CLASSES.map((className, index) => (
        <span key={index} className={className} />
      ))}
      <Flex direction="column" gap="3" className="relative z-10">
        <div className={COMPOSER_FIELD_CLASS}>
          <TextArea
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={3}
            variant="soft"
            className={COMPOSER_TEXTAREA_CLASS}
          />
        </div>
        <Flex align="center" justify="between" gap="3">
          <Text size="2" className={hintClassName} aria-live="polite">
            {hintMessage}
          </Text>
          <Button
            type="submit"
            size="3"
            disabled={isSubmitDisabled}
            className={CTA_BUTTON_CLASS}
          >
            <span className={CTA_SHINE_CLASS} />
            <span className={CTA_CONTENT_CLASS}>
              <PaperPlaneIcon />
              <span>Send</span>
            </span>
          </Button>
        </Flex>
      </Flex>
    </form>
  );
}

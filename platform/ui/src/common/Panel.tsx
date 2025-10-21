import { useId, useState, type ReactNode } from "react";
import { Box } from "@radix-ui/themes";

import { combineClassNames } from "../utils/class-names";

const PANEL_SURFACE_CLASS = [
  "group relative overflow-hidden rounded-[2.75rem] border bg-card bg-gradient-to-br p-10 text-foreground",
  "from-[hsl(var(--hero-surface-from))] via-[hsl(var(--hero-surface-via))] to-[hsl(var(--hero-surface-to))]",
  "shadow-[var(--hero-surface-shadow)] border-border/60",
  "dark:from-[hsl(var(--hero-surface-from-dark))] dark:via-[hsl(var(--hero-surface-via-dark))] dark:to-[hsl(var(--hero-surface-to-dark))]",
  "dark:shadow-[var(--hero-surface-shadow-dark)]",
].join(" ");

const PANEL_CONTENT_CLASS = [
  "relative flex flex-col gap-6 rounded-[1.9rem] border p-7",
  "border-[color:var(--overview-panel-item-border)]",
  "bg-[color:var(--overview-panel-item-bg)]",
  "text-[color:var(--overview-panel-foreground)]",
  "shadow-[var(--overview-panel-item-shadow)]",
].join(" ");

const PANEL_BADGE_CLASS = [
  "inline-flex items-center gap-2 rounded-full px-3 py-1",
  "text-xs font-semibold uppercase tracking-[0.25em]",
  "bg-[color:var(--hero-badge-bg)]",
  "text-[color:var(--hero-badge-fg)]",
  "dark:bg-[color:var(--hero-badge-bg-dark)]",
  "dark:text-[color:var(--hero-badge-fg-dark)]",
].join(" ");

const PANEL_BADGE_DOT_CLASS = [
  "h-2 w-2 rounded-full",
  "bg-[color:var(--hero-badge-fg)]",
  "shadow-[var(--hero-cta-shadow)]",
].join(" ");

const PANEL_OVERLAY_CLASS = [
  "pointer-events-none absolute inset-0 -z-10",
  "bg-[var(--hero-surface-overlay)]",
  "dark:bg-[var(--hero-surface-overlay-dark)]",
].join(" ");
const PANEL_GLARE_CLASS = [
  "pointer-events-none absolute inset-0 -z-10 opacity-80 blur-2xl",
  "[background:var(--hero-surface-lens)]",
  "dark:[background:var(--hero-surface-lens-dark)]",
].join(" ");
const PANEL_BODY_CLASS = "h-auto text-sm text-[color:var(--overview-panel-foreground)]";
const PANEL_HEADER_ACTIONS_CLASS = "ml-auto flex items-center justify-end gap-3";
const PANEL_TOGGLE_BUTTON_CLASS = [
  "inline-flex items-center rounded-full border border-transparent",
  "bg-[color:var(--hero-badge-bg)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em]",
  "text-[color:var(--hero-badge-fg)] transition hover:opacity-80",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
].join(" ");

export interface PanelProps {
  title: string;
  description?: string;
  className?: string;
  actions?: ReactNode;
  children: ReactNode;
  id?: string;
}

export function Panel({
  title,
  description,
  actions = null,
  className,
  id,
  children,
}: PanelProps): JSX.Element {
  const surfaceClassName = combineClassNames(PANEL_SURFACE_CLASS, className);
  const generatedId = useId();
  const bodyId = id ? `${id}__panel-body` : `${generatedId}-panel-body`;
  const [isExpanded, setIsExpanded] = useState(true);
  const toggleLabel = isExpanded ? "Collapse panel" : "Expand panel";
  const handleToggle = (): void => {
    setIsExpanded((value) => !value);
  };

  return (
    <Box asChild className={surfaceClassName}>
      <section id={id}>
        <div className={PANEL_OVERLAY_CLASS} aria-hidden />
        <div className={PANEL_GLARE_CLASS} aria-hidden />
        <div className={PANEL_CONTENT_CLASS}>
          <header className="flex flex-wrap items-center gap-4 justify-between">
            <div className="max-w-xl space-y-1">
              <div className={PANEL_BADGE_CLASS}>
                <span className={PANEL_BADGE_DOT_CLASS} />
                Live Surface
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-[color:var(--overview-panel-foreground)] drop-shadow-sm">
                {title}
              </h2>
              {description ? (
                <p className="text-sm text-[color:var(--overview-panel-muted)]">
                  {description}
                </p>
              ) : null}
            </div>
            <div className={PANEL_HEADER_ACTIONS_CLASS}>
              {actions}
              <button
                type="button"
                className={PANEL_TOGGLE_BUTTON_CLASS}
                onClick={handleToggle}
                aria-expanded={isExpanded}
                aria-controls={bodyId}
              >
                {toggleLabel}
              </button>
            </div>
          </header>
          {isExpanded ? (
            <div id={bodyId} className={PANEL_BODY_CLASS}>
              {children}
            </div>
          ) : null}
        </div>
      </section>
    </Box>
  );
}

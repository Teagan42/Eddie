import type { ReactNode } from "react";
import { Box } from "@radix-ui/themes";
import { clsx } from "clsx";

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
const PANEL_BODY_CLASS = "flex-1 text-sm text-[color:var(--overview-panel-foreground)]";

interface PanelProps {
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
  actions,
  className,
  id,
  children,
}: PanelProps): JSX.Element {
  const surfaceClassName = clsx(PANEL_SURFACE_CLASS, className);

  return (
    <Box asChild className={surfaceClassName}>
      <section id={id}>
        <div className={PANEL_OVERLAY_CLASS} aria-hidden />
        <div className={PANEL_GLARE_CLASS} aria-hidden />
        <div className={PANEL_CONTENT_CLASS}>
          <header className="flex flex-col items-start gap-4 md:flex-row md:items-center md:justify-between">
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
            {actions ?? null}
          </header>
          <div className={PANEL_BODY_CLASS}>{children}</div>
        </div>
      </section>
    </Box>
  );
}

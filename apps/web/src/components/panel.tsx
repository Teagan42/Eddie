import type { ReactNode } from "react";
import { clsx } from "clsx";

interface PanelProps {
  title: string;
  description?: string;
  className?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function Panel({
  title,
  description,
  actions,
  className,
  children,
}: PanelProps): JSX.Element {
  return (
    <section
      className={clsx(
        "flex flex-col gap-4 rounded-2xl border border-muted/40 bg-muted/10 p-6 backdrop-blur",
        className
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          {description ? (
            <p className="text-sm text-foreground/70">{description}</p>
          ) : null}
        </div>
        {actions}
      </header>
      <div className="min-h-[6rem] flex-1 text-sm text-foreground/90">{children}</div>
    </section>
  );
}

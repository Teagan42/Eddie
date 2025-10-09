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
        "group relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500/40 via-emerald-500/0 to-sky-500/40 p-[1px] shadow-[0_45px_90px_-55px_rgba(16,185,129,0.85)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.35),_transparent_60%)] opacity-0 transition-opacity duration-500 group-hover:opacity-80" />
      <div className="relative flex flex-col gap-5 rounded-[1.7rem] border border-white/10 bg-slate-950/80 p-6 text-foreground/90 backdrop-blur-xl">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-xl space-y-1">
            <h2 className="text-xl font-semibold tracking-tight text-white drop-shadow">{title}</h2>
            {description ? (
              <p className="text-sm text-foreground/70">{description}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
        <div className="min-h-[6rem] flex-1 text-sm text-foreground/90">
          {children}
        </div>
      </div>
    </section>
  );
}

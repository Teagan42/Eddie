import type { ReactNode } from "react";
import { clsx } from "clsx";

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
  return (
    <section
      id={id}
      className={clsx(
        "group relative overflow-hidden rounded-[2rem] border border-white/15 bg-white/10 p-[1px] shadow-[0_45px_90px_-55px_rgba(6,182,212,0.55)] backdrop-blur-xl",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,_rgba(56,189,248,0.3),transparent_60%),radial-gradient(circle_at_bottom_right,_rgba(16,185,129,0.28),transparent_55%)] opacity-40 transition-opacity duration-500 group-hover:opacity-80" />
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-white/20 via-transparent to-white/10 opacity-0 transition-opacity duration-500 group-hover:opacity-70" />
      <div className="relative flex flex-col gap-6 rounded-[1.9rem] border border-white/15 bg-slate-900/55 p-7 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.25em] text-emerald-50">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.25)]" />
              Live Surface
            </div>
            <h2 className="text-2xl font-semibold tracking-tight text-white drop-shadow-sm">{title}</h2>
            {description ? (
              <p className="text-sm text-foreground/75">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </header>
        <div className="min-h-[6rem] flex-1 text-sm text-foreground">
          {children}
        </div>
      </div>
    </section>
  );
}

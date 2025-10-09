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
        "group relative overflow-hidden rounded-[2.2rem] border border-white/10 bg-slate-950/40 p-[1px] shadow-[0_55px_120px_-60px_rgba(56,189,248,0.75)] transition-transform duration-500 hover:-translate-y-1 hover:shadow-[0_65px_140px_-55px_rgba(139,92,246,0.55)]",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.28),_transparent_55%)] opacity-0 transition-opacity duration-700 group-hover:opacity-100" />
        <div className="absolute -top-24 left-1/3 h-40 w-40 rounded-full bg-emerald-400/30 blur-[120px]" />
        <div className="absolute -bottom-28 right-1/4 h-48 w-48 rounded-full bg-sky-500/20 blur-[140px]" />
      </div>
      <div className="relative flex flex-col gap-6 rounded-[1.9rem] border border-white/10 bg-gradient-to-br from-slate-950/90 via-slate-950/70 to-slate-950/60 p-7 text-foreground/90 backdrop-blur-2xl">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.4em] text-emerald-200/80">
              Control surface
            </p>
            <h2 className="text-2xl font-semibold tracking-tight text-white drop-shadow">
              {title}
            </h2>
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

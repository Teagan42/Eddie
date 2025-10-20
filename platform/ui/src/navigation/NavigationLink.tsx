import { Link, useLocation } from "react-router-dom";

import { combineClassNames } from "../utils/class-names";

export interface NavigationLinkProps {
  to: string;
  label: string;
  className?: string;
}

export function NavigationLink({ to, label, className }: NavigationLinkProps): JSX.Element {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      aria-current={isActive ? "page" : undefined}
      className={combineClassNames(
        "group relative overflow-hidden rounded-full px-4 py-2 text-sm font-medium transition-all",
        isActive
          ? "bg-emerald-500/90 text-emerald-50 shadow-[0_18px_45px_-20px_rgba(16,185,129,0.8)]"
          : "text-white/80 hover:-translate-y-0.5 hover:bg-emerald-500/15 hover:text-white",
        className
      )}
    >
      <span className="relative z-10 flex items-center gap-2">{label}</span>
      <span className="absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
    </Link>
  );
}

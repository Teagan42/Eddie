import { cn } from "@/components/lib/utils";

interface AuroraBackgroundProps {
  className?: string;
}

export function AuroraBackground({ className }: AuroraBackgroundProps): JSX.Element {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(circle_at_center,white_20%,transparent_70%)]",
        className
      )}
    >
      <div className="absolute -left-1/3 top-[-20%] h-[60rem] w-[60rem] rounded-full bg-emerald-400/30 blur-3xl" />
      <div className="absolute -right-1/3 top-1/4 h-[55rem] w-[55rem] rounded-full bg-sky-400/25 blur-3xl" />
      <div className="absolute left-1/2 top-[60%] h-[45rem] w-[45rem] -translate-x-1/2 rounded-full bg-lime-400/15 blur-3xl" />
      <div className="absolute inset-0 animate-[aurora_12s_ease-in-out_infinite] bg-[radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.45),transparent_55%),radial-gradient(circle_at_80%_30%,rgba(74,222,128,0.45),transparent_45%),radial-gradient(circle_at_50%_80%,rgba(192,132,252,0.3),transparent_55%)] opacity-65" />
    </div>
  );
}

import { combineClassNames } from "../utils/class-names";

export interface AuroraBackgroundProps {
  className?: string;
}

const GLOW_LAYERS = [
  "absolute -left-1/3 top-[-20%] h-[60rem] w-[60rem] rounded-full bg-emerald-400/30 blur-3xl",
  "absolute -right-1/3 top-1/4 h-[55rem] w-[55rem] rounded-full bg-sky-400/25 blur-3xl",
  "absolute left-1/2 top-[60%] h-[45rem] w-[45rem] -translate-x-1/2 rounded-full bg-lime-400/15 blur-3xl",
] as const;

const ANIMATED_LAYERS = [
  "absolute inset-[-10%] animate-[aurora_16s_ease-in-out_infinite] bg-[radial-gradient(circle_at_20%_20%,rgba(125,211,252,0.5),transparent_60%),radial-gradient(circle_at_80%_30%,rgba(74,222,128,0.55),transparent_45%),radial-gradient(circle_at_45%_80%,rgba(192,132,252,0.35),transparent_55%)] opacity-70 mix-blend-screen",
  "absolute inset-[-15%] animate-[aurora-pulse_7s_ease-in-out_infinite] bg-[radial-gradient(circle_at_30%_25%,rgba(59,130,246,0.3),transparent_60%),radial-gradient(circle_at_70%_65%,rgba(45,212,191,0.35),transparent_55%),radial-gradient(circle_at_20%_75%,rgba(16,185,129,0.25),transparent_65%)] opacity-60 mix-blend-color-dodge blur-[120px]",
] as const;

export function AuroraBackground({ className }: AuroraBackgroundProps): JSX.Element {
  return (
    <div
      aria-hidden
      className={combineClassNames(
        "pointer-events-none absolute inset-0 overflow-hidden [mask-image:radial-gradient(circle_at_center,white_20%,transparent_70%)]",
        className,
      )}
    >
      {GLOW_LAYERS.map((layerClass, index) => (
        <div key={`glow-${index}`} className={layerClass} />
      ))}
      {ANIMATED_LAYERS.map((layerClass, index) => (
        <div key={`animated-${index}`} className={layerClass} />
      ))}
    </div>
  );
}

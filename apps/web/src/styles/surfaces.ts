export const SURFACE_CONTENT_CLASS =
  "mx-auto w-full max-w-6xl space-y-8 p-6 sm:p-8 lg:p-10";

const SURFACE_LAYOUTS = {
  chat:
    "relative overflow-hidden rounded-[2.75rem] border border-white/15 bg-gradient-to-br from-slate-950/80 via-slate-900/65 to-slate-900/25 shadow-[0_65px_120px_-60px_rgba(14,116,144,0.6)] backdrop-blur-2xl",
  config:
    "relative overflow-hidden rounded-[2.75rem] border border-white/15 bg-gradient-to-br from-slate-950/75 via-slate-900/60 to-slate-900/30 shadow-[0_65px_120px_-60px_rgba(14,116,144,0.45)] backdrop-blur-xl",
} as const satisfies Record<string, string>;

type SurfaceKey = keyof typeof SURFACE_LAYOUTS;

export function getSurfaceLayoutClasses(surface: SurfaceKey): string {
  const classes = SURFACE_LAYOUTS[surface];
  if (!classes) {
    throw new Error(`Unknown surface layout: ${surface}`);
  }
  return classes;
}

import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--color-background) / <alpha-value>)",
        foreground: "hsl(var(--color-foreground) / <alpha-value>)",
        muted: "hsl(var(--color-muted) / <alpha-value>)",
        accent: "hsl(var(--color-accent) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;

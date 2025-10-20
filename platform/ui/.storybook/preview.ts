import type { Preview } from "@storybook/react";

const SURFACE_COLOR = "#0f172a";

export const STORYBOOK_BACKGROUNDS = [
  { name: "surface", value: SURFACE_COLOR },
  { name: "dark", value: SURFACE_COLOR },
  { name: "light", value: "#ffffff" },
] as const;

const preview: Preview = {
  parameters: {
    actions: { argTypesRegex: "^on[A-Z].*" },
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/,
      },
    },
    backgrounds: {
      default: STORYBOOK_BACKGROUNDS[0].name,
      values: STORYBOOK_BACKGROUNDS,
    },
  },
};

export default preview;

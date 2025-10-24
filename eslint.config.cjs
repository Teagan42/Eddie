const js = require("@eslint/js");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      "dist/**",
      "apps/**/dist/**",
      "node_modules/**",
      "tailwind.config.ts",
      "platform/integrations/api-client/src/generated/**",
      "platform/runtime/memory/src/**/*.d.ts",
    ],
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...tsPlugin.configs.recommended.rules,
      // enforce 2-space indentation consistently across the repo
      indent: ["error", 2, { SwitchCase: 1 }],
      "no-undef": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
      "no-constant-condition": "off",
    },
  },
];

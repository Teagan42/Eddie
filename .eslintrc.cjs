module.exports = {
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier",
  ],
  env: {
    node: true,
    es2022: true,
  },
  ignorePatterns: ["dist", "apps/**/dist", "node_modules"],
  rules: {
    "@typescript-eslint/no-explicit-any": "off",
    indent: ["error", 2, { SwitchCase: 1 }],
  },
};

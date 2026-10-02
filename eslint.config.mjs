import js from "@eslint/js";
import tseslint from "typescript-eslint";
import wbl from "./tooling/eslint/wbl-plugin.mjs";

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/.next/**", "**/dist/**", "**/next-env.d.ts", "**/generated/**", "**/playwright-report/**", "**/test-results/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { wbl },
    languageOptions: { ecmaVersion: 2023, sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
    rules: {
      "wbl/module-boundaries": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-imports": "off",
    },
  },
  {
    files: ["apps/**/*.{ts,tsx}", "packages/**/*.{ts,tsx}"],
    ignores: ["**/*.test.*", "**/tests/**"],
    rules: { "wbl/no-service-role": "error" },
  },
  {
    files: ["packages/ui/**/*.tsx", "apps/web/**/*.tsx", "apps/prototype/**/*.tsx"],
    rules: { "wbl/no-hex-in-components": "error", "wbl/logical-properties": "error" },
  },
  {
    files: ["**/*.mjs", "scripts/**", "tooling/**"],
    languageOptions: { globals: { process: "readonly", console: "readonly", URL: "readonly" } },
  },
);

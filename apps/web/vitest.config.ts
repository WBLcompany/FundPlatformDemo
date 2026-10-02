import { defineConfig } from "vitest/config";

// Unit tests only; e2e/ is Playwright's (pnpm test:e2e).
export default defineConfig({ test: { exclude: ["e2e/**", "node_modules/**", ".next/**"], passWithNoTests: true } });

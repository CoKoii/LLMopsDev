import js from "@eslint/js";
import type { Linter } from "eslint";

const baseConfig: Linter.Config[] = [
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/coverage/**",
      "**/.turbo/**",
    ],
  },
  js.configs.recommended,
];

const defineConfig = (...config: Linter.Config[]): Linter.Config[] => [
  ...baseConfig,
  ...config,
];

export { defineConfig };

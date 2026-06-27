import js from "@eslint/js";
import { defineConfig as eslintDefineConfig } from "eslint/config";

function defineConfig() {
  return eslintDefineConfig([
    {
      files: ["**/*.js"],
      plugins: {
        js,
      },
      extends: ["js/recommended"],
      rules: {
        "no-unused-vars": "warn",
        "no-undef": "warn",
      },
    },
  ]);
}

export { defineConfig };

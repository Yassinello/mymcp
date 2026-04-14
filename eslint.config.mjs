import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

// Minimal Node globals — we don't depend on the `globals` package.
const NODE_GLOBALS = {
  process: "readonly",
  Buffer: "readonly",
  __dirname: "readonly",
  __filename: "readonly",
  global: "readonly",
  console: "readonly",
  module: "readonly",
  require: "readonly",
  exports: "writable",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  setImmediate: "readonly",
  clearImmediate: "readonly",
  URL: "readonly",
  fetch: "readonly",
};

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-empty-object-type": "off",
    },
  },
  // Node globals + CJS allowed for release scripts.
  {
    files: ["scripts/**/*.{js,ts}"],
    languageOptions: {
      globals: NODE_GLOBALS,
      sourceType: "commonjs",
    },
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // `scripts/` used to be globally ignored — they weren't linted even
    // though they're release-critical (contract test, registry test, e2e
    // test, update checker). Lifted in v0.5 phase 13 (GD2). See TECH
    // IMPROVEMENTS report for context.
    ignores: [".next/", "node_modules/"],
  }
);

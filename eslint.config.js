import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", ".sites-runtime/**", ".tmp/**"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      // Input validation deliberately rejects control characters with /[\u0000-\u001f]/-style patterns.
      "no-control-regex": "off",
    },
  },
  {
    // Test doubles and fixtures cast freely; product code keeps the rule.
    files: ["src/__tests__/**", "supabase/tests/**", "**/*.test.{ts,tsx}"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  {
    // Edge runtime sources are pinned by SHA-256 in docs/supabase-loop-ui/manifest.json, so
    // changing them requires the reviewed bundle release; flag rather than block until then.
    files: ["supabase/functions/**"],
    rules: { "@typescript-eslint/no-non-null-asserted-optional-chain": "warn" },
  },
);

// eslint.config.mjs
import globals from "globals";
import pluginJs from "@eslint/js";
import tsEsLint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  { files: ["**/*.{js,mjs,cjs,ts}"] },
  { files: ["**/*.js"], languageOptions: { sourceType: "commonjs" } },
  { languageOptions: { globals: globals.browser } },
  pluginJs.configs.recommended,
  ...tsEsLint.configs.recommended,
  {
    ignores: [".node_modules/*", "dist/*"],
  },
  eslintConfigPrettier,
];

// Lints the scripts the kit installs into a project's .claude/ the way a project's own lint sees them:
// `eslint .` with eslint:recommended and Node globals. Run in CI only; the kit itself has no dependencies.
import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: { sourceType: "commonjs", globals: { ...globals.node } },
  },
];

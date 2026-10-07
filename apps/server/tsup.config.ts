import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  clean: true,
  sourcemap: true,
  // Shared schemas ship as TypeScript source, so bundle them in; everything else stays external.
  noExternal: ["@todo/shared"],
});

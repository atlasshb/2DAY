import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
    // @2day/core is consumed as raw TS with NodeNext-style ".js" specifiers
    // (see next.config.ts's webpack.resolve.extensionAlias for the same trick
    // applied to the Next.js build) — teach Vite/vitest the same mapping.
    extensions: [".ts", ".tsx", ".js", ".mjs", ".json"],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    passWithNoTests: true,
  },
});

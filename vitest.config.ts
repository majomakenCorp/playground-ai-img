import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    pool: "forks",
    coverage: {
      provider: "v8",
      include: [
        "src/lib/postprocess/**",
        "src/lib/storage/history.ts",
        "src/app/api/history/[id]/split-quadrants/**",
        "src/app/api/history/[id]/vectorize/**",
        "src/app/api/postprocesado/**",
      ],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      "server-only": path.resolve(__dirname, "./tests/stubs/server-only.ts"),
    },
  },
});

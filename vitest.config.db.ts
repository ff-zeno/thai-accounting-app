import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["src/**/*.db.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    // All db.test.ts files share one Postgres instance — run sequentially to
    // avoid races during schema reset + migration.
    fileParallelism: false,
  },
});

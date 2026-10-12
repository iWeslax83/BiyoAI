import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Several test files share one test database and clear its tables, so
    // files must not run at the same time.
    fileParallelism: false,
  },
});

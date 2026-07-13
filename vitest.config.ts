import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/server/**/*.ts", "src/app/api/**/*.ts"],
      exclude: ["src/server/db.ts"],
    },
    env: {
      DATABASE_URL: "file:./test.db",
    },
  },
});

import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: "postgresql://jobtrack:jobtrack@localhost:5432/jobtrack_test?schema=public",
      JWT_SECRET: "test-secret",
      CLIENT_URL: "http://localhost:5173",
    },
  },
});
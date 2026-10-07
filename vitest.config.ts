import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    environmentOptions: {
      // jsdom's localStorage/sessionStorage throw SecurityError on the default
      // opaque "about:blank" origin -- give it a real origin so the runtime's
      // storage-backed functions (react.ts) work under test.
      jsdom: { url: "http://localhost/" },
    },
    include: ["tests/**/*.test.{ts,tsx}"],
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts"],
      reporter: ["text", "json", "html", "lcov"],
      thresholds: {
        lines: 100,
        branches: 100,
        functions: 100,
        statements: 100,
      },
    },
  },
});

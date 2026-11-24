import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// Two projects. `unit` runs under jsdom and carries the 100% coverage gate.
// `browser` runs the tests whose subject only a real engine can prove (focus
// movement, key delivery order, layout) in headless Chromium; it is not part of
// the coverage run because those tests exercise the same source the unit tests
// already cover.
export default defineConfig({
  test: {
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
    projects: [
      {
        test: {
          name: "unit",
          environment: "jsdom",
          environmentOptions: {
            // jsdom's localStorage/sessionStorage throw SecurityError on the default
            // opaque "about:blank" origin -- give it a real origin so the runtime's
            // storage-backed functions (react.ts) work under test.
            jsdom: { url: "http://localhost/" },
          },
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: ["tests/browser/**"],
          globals: true,
          setupFiles: ["./tests/setup.ts"],
        },
      },
      {
        // Declared up front: with a cold cache Vite otherwise discovers these
        // while the first test file runs, reloads the page and drops its tests.
        optimizeDeps: {
          include: [
            "react",
            "react/jsx-dev-runtime",
            "react/jsx-runtime",
            "react-dom",
            "react-dom/client",
            "vitest/browser",
          ],
        },
        test: {
          name: "browser",
          include: ["tests/browser/**/*.browser.test.{ts,tsx}"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});

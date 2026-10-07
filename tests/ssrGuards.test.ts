// @vitest-environment node
//
// These functions are called from game code that may run before the DOM
// exists (SSR, a worker, or a very early script tag) -- their `typeof
// document === "undefined"` / `typeof window === "undefined"` guards only
// have something to prove in an environment that genuinely lacks those
// globals, so this file runs under vitest's plain "node" environment
// instead of jsdom.
import { describe, expect, test } from "vitest";
import { applySettingsToDocument, readGameProgress } from "../src/react";
import {
  clearGameRuntimePaused,
  isGameRuntimePaused,
  setGameRuntimePaused,
} from "../src/runtimePause";

describe("game runtime pause flag without a DOM", () => {
  test("setGameRuntimePaused is a no-op and isGameRuntimePaused reads false", () => {
    expect(typeof document).toBe("undefined");

    expect(() => setGameRuntimePaused(true)).not.toThrow();
    expect(isGameRuntimePaused()).toBe(false);

    clearGameRuntimePaused();
  });
});

describe("applySettingsToDocument without a DOM", () => {
  test("is a no-op instead of throwing on document.documentElement", () => {
    expect(typeof document).toBe("undefined");
    expect(() => applySettingsToDocument()).not.toThrow();
  });
});

describe("the default storage accessor without a window", () => {
  test("readGameProgress degrades to the empty-progress shape instead of throwing", () => {
    expect(typeof window).toBe("undefined");
    expect(() => readGameProgress("node-env-game")).not.toThrow();
    expect(readGameProgress("node-env-game")).toMatchObject({ slug: "node-env-game" });
  });
});

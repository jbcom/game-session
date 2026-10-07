// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  clearGameSaveSlot,
  DEFAULT_STORAGE_NAMESPACE,
  readGameProgress,
  readGameSettings,
  writeGameSettings,
} from "../src/react";

function throwingStorage(): Storage {
  return {
    getItem: vi.fn(() => {
      throw new Error("SecurityError: storage disabled");
    }),
    setItem: vi.fn(() => {
      throw new Error("QuotaExceededError");
    }),
    removeItem: vi.fn(() => {
      throw new Error("SecurityError: storage disabled");
    }),
    clear: vi.fn(),
    key: vi.fn(() => null),
    length: 0,
  };
}

describe("storage failure resilience", () => {
  afterEach(() => {
    localStorage.clear();
  });

  test("readGameSettings falls back to defaults when storage.getItem throws", () => {
    const settings = readGameSettings(throwingStorage(), DEFAULT_STORAGE_NAMESPACE);
    expect(settings.soundEnabled).toBe(true);
  });

  test("readGameSettings falls back to defaults when the stored value is corrupt JSON", () => {
    localStorage.setItem(`${DEFAULT_STORAGE_NAMESPACE}:settings`, "{not-json");
    const settings = readGameSettings();
    expect(settings.soundEnabled).toBe(true);
  });

  test("writeGameSettings does not throw when storage.setItem throws (e.g. quota exceeded)", () => {
    expect(() =>
      writeGameSettings(
        {
          graphicsQuality: "balanced",
          handedness: "right",
          hapticsEnabled: true,
          joystickSensitivity: 1,
          reducedMotion: false,
          soundEnabled: true,
          textScale: 1,
        },
        throwingStorage(),
        DEFAULT_STORAGE_NAMESPACE
      )
    ).not.toThrow();
  });

  test("clearGameSaveSlot does not throw when storage.removeItem throws", () => {
    expect(() =>
      clearGameSaveSlot("some-game", throwingStorage(), DEFAULT_STORAGE_NAMESPACE)
    ).not.toThrow();
  });

  test("the default storage accessor falls back to undefined when window.localStorage itself throws (Safari private mode)", () => {
    const descriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: The operation is insecure.");
      },
    });

    try {
      // readGameProgress() with no storage argument resolves it via the
      // module's internal getStorage() default -- it must degrade to the
      // empty-progress shape rather than throwing.
      expect(() => readGameProgress("some-game")).not.toThrow();
      expect(readGameProgress("some-game")).toMatchObject({ slug: "some-game" });
    } finally {
      if (descriptor) Object.defineProperty(window, "localStorage", descriptor);
    }
  });
});

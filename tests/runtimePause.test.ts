// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  clearCabinetRuntimePaused,
  isCabinetRuntimePaused,
  setCabinetRuntimePaused,
} from "../src/runtimePause";

afterEach(() => {
  clearCabinetRuntimePaused();
});

describe("cabinet runtime pause flag", () => {
  test("stores pause state on the document and emits pause changes", () => {
    const listener = vi.fn();
    window.addEventListener("game-session:pause-change", listener);

    setCabinetRuntimePaused(true);

    expect(isCabinetRuntimePaused()).toBe(true);
    expect(document.documentElement.dataset.cabinetPaused).toBe("true");
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: { paused: true } })
    );

    clearCabinetRuntimePaused();

    expect(isCabinetRuntimePaused()).toBe(false);
    expect(document.documentElement.dataset.cabinetPaused).toBe("false");

    window.removeEventListener("game-session:pause-change", listener);
  });
});

// @vitest-environment jsdom
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  clearGameRuntimePaused,
  isGameRuntimePaused,
  setGameRuntimePaused,
} from "../src/runtimePause";

afterEach(() => {
  clearGameRuntimePaused();
});

describe("game runtime pause flag", () => {
  test("stores pause state on the document and emits pause changes", () => {
    const listener = vi.fn();
    window.addEventListener("game-session:pause-change", listener);

    setGameRuntimePaused(true);

    expect(isGameRuntimePaused()).toBe(true);
    expect(document.documentElement.dataset.gamePaused).toBe("true");
    expect(listener).toHaveBeenLastCalledWith(
      expect.objectContaining({ detail: { paused: true } })
    );

    clearGameRuntimePaused();

    expect(isGameRuntimePaused()).toBe(false);
    expect(document.documentElement.dataset.gamePaused).toBe("false");

    window.removeEventListener("game-session:pause-change", listener);
  });
});

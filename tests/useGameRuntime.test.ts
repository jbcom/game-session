// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { useLayoutEffect, useRef } from "react";
import { beforeEach, describe, expect, test } from "vitest";
import { applySettingsToDocument, useGameRuntime } from "../src/react";
import { DEFAULT_GAME_SETTINGS } from "../src/runtime";

describe("useGameRuntime", () => {
  beforeEach(() => {
    localStorage.clear();
    delete document.documentElement.dataset.reducedMotion;
    delete document.documentElement.dataset.graphicsQuality;
    delete document.documentElement.dataset.handedness;
  });

  test("with no slug, exposes settings but no progress/save-slot state", () => {
    const { result } = renderHook(() => useGameRuntime());

    expect(result.current.settings).toEqual(DEFAULT_GAME_SETTINGS);
    expect(result.current.progress).toBeUndefined();
    expect(result.current.saveSlot).toBeUndefined();
  });

  test("loads existing progress and save slot for a slug on mount", () => {
    const { result: seed } = renderHook(() => useGameRuntime("hook-game"));
    act(() => {
      seed.current.beginRun("cozy", { progressSummary: "Room 1" });
    });

    const { result } = renderHook(() => useGameRuntime("hook-game"));

    expect(result.current.progress).toMatchObject({ sessionsStarted: 1 });
    expect(result.current.saveSlot).toMatchObject({ progressSummary: "Room 1" });
  });

  test("setSettings normalizes, persists, and pushes settings onto the document", () => {
    const { result } = renderHook(() => useGameRuntime());

    act(() => {
      result.current.setSettings({
        ...DEFAULT_GAME_SETTINGS,
        graphicsQuality: "high",
        joystickSensitivity: 99,
      });
    });

    expect(result.current.settings.graphicsQuality).toBe("high");
    // out-of-range sensitivity was clamped by normalizeGameSettings
    expect(result.current.settings.joystickSensitivity).toBe(1.6);
    expect(document.documentElement.dataset.graphicsQuality).toBe("high");

    // and it round-trips through storage
    const { result: reloaded } = renderHook(() => useGameRuntime());
    expect(reloaded.current.settings.graphicsQuality).toBe("high");
  });

  test("setSettings accepts an updater function", () => {
    const { result } = renderHook(() => useGameRuntime());

    act(() => {
      result.current.setSettings((current) => ({ ...current, soundEnabled: false }));
    });

    expect(result.current.settings.soundEnabled).toBe(false);
  });

  test("setProgress is a no-op without a slug, and updates state+storage with one", () => {
    const { result: noSlug } = renderHook(() => useGameRuntime());
    act(() => {
      noSlug.current.setProgress((current) => current ?? ({} as never));
    });
    expect(noSlug.current.progress).toBeUndefined();

    const { result } = renderHook(() => useGameRuntime("progress-game"));
    act(() => {
      result.current.setProgress((current) => ({
        ...(current ?? {
          slug: "progress-game",
          lastSelectedMode: "standard",
          bestScore: 0,
          sessionsStarted: 0,
          sessionsCompleted: 0,
          sessionsFailed: 0,
          sessionsAbandoned: 0,
          totalPlayMs: 0,
          updatedAt: new Date().toISOString(),
          milestones: [],
        }),
        bestScore: 500,
      }));
    });

    expect(result.current.progress?.bestScore).toBe(500);

    const { result: reloaded } = renderHook(() => useGameRuntime("progress-game"));
    expect(reloaded.current.progress?.bestScore).toBe(500);
  });

  test("setProgress accepts a plain GameProgress value in addition to an updater function", () => {
    const { result } = renderHook(() => useGameRuntime("plain-progress-game"));

    act(() => {
      result.current.setProgress({
        slug: "plain-progress-game",
        lastSelectedMode: "challenge",
        bestScore: 250,
        sessionsStarted: 3,
        sessionsCompleted: 1,
        sessionsFailed: 0,
        sessionsAbandoned: 0,
        totalPlayMs: 12_000,
        updatedAt: "2026-01-01T00:00:00.000Z",
        milestones: ["first-win"],
      });
    });

    expect(result.current.progress).toMatchObject({ bestScore: 250, sessionsStarted: 3 });
  });

  test("setProgress falls back to an empty progress base if invoked before the load effect settles state for a newly-acquired slug", () => {
    // A hook instance that starts with no slug initializes `progress` state
    // to undefined. If a consumer acquires a slug and calls setProgress from
    // a layout effect on that same commit -- before the hook's own mount
    // `useEffect` (a *passive* effect, lower priority than layout effects)
    // has re-synced `progress` from storage -- the updater still sees the
    // stale `undefined` state and must not crash on `undefined.bestScore`.
    const { result, rerender } = renderHook(
      ({ slug }: { slug?: string }) => {
        const runtime = useGameRuntime(slug);
        const prevSlug = useRef(slug);
        useLayoutEffect(() => {
          if (slug && !prevSlug.current) {
            runtime.setProgress((current) => ({ ...current, bestScore: 7 }));
          }
          prevSlug.current = slug;
        });
        return runtime;
      },
      { initialProps: { slug: undefined as string | undefined } }
    );

    expect(result.current.progress).toBeUndefined();

    act(() => {
      rerender({ slug: "layout-race-game" });
    });

    expect(result.current.progress).toMatchObject({ slug: "layout-race-game", bestScore: 7 });
  });

  test("beginRun is a no-op without a slug", () => {
    const { result } = renderHook(() => useGameRuntime());
    let returned: unknown;

    act(() => {
      returned = result.current.beginRun("standard");
    });

    expect(returned).toBeUndefined();
    expect(result.current.saveSlot).toBeUndefined();
  });

  test("beginRun with a slug seeds progress and an active save slot", () => {
    const { result } = renderHook(() => useGameRuntime("begin-game"));

    act(() => {
      result.current.beginRun("challenge", { progressSummary: "Wave 1" });
    });

    expect(result.current.progress).toMatchObject({
      lastSelectedMode: "challenge",
      sessionsStarted: 1,
    });
    expect(result.current.saveSlot).toMatchObject({
      mode: "challenge",
      progressSummary: "Wave 1",
      status: "active",
    });
  });

  test("saveRun writes an arbitrary slot directly and updates state", () => {
    const { result } = renderHook(() => useGameRuntime("save-game"));

    act(() => {
      result.current.saveRun({
        slug: "save-game",
        mode: "standard",
        status: "active",
        label: "Manual Save",
        startedAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        progressSummary: "Custom checkpoint",
      });
    });

    expect(result.current.saveSlot).toMatchObject({ progressSummary: "Custom checkpoint" });

    const { result: reloaded } = renderHook(() => useGameRuntime("save-game"));
    expect(reloaded.current.saveSlot).toMatchObject({ progressSummary: "Custom checkpoint" });
  });

  test("updateRun is a no-op without a slug, undefined with no active run, and patches an active run", () => {
    const { result: noSlug } = renderHook(() => useGameRuntime());
    let returned: unknown;
    act(() => {
      returned = noSlug.current.updateRun({ progressSummary: "nope" });
    });
    expect(returned).toBeUndefined();

    const { result } = renderHook(() => useGameRuntime("update-game"));
    act(() => {
      returned = result.current.updateRun({ progressSummary: "no active run" });
    });
    expect(returned).toBeUndefined();
    expect(result.current.saveSlot).toBeUndefined();

    act(() => {
      result.current.beginRun("standard", { progressSummary: "Start" });
    });
    act(() => {
      returned = result.current.updateRun({ progressSummary: "Midway" });
    });

    expect(result.current.saveSlot).toMatchObject({ progressSummary: "Midway" });
    expect(returned).toMatchObject({ progressSummary: "Midway" });
  });

  test("clearRun is a no-op without a slug, and clears the active save slot with one", () => {
    const { result: noSlug } = renderHook(() => useGameRuntime());
    act(() => {
      noSlug.current.clearRun();
    });
    expect(noSlug.current.saveSlot).toBeUndefined();

    const { result } = renderHook(() => useGameRuntime("clear-game"));
    act(() => {
      result.current.beginRun("standard");
    });
    expect(result.current.saveSlot).toBeDefined();

    act(() => {
      result.current.clearRun();
    });

    expect(result.current.saveSlot).toBeUndefined();
  });

  test("finishRun is a no-op without a slug, and records a result with one", () => {
    const { result: noSlug } = renderHook(() => useGameRuntime());
    let returned: unknown;
    act(() => {
      returned = noSlug.current.finishRun({ mode: "standard", status: "completed", score: 10 });
    });
    expect(returned).toBeUndefined();

    const { result } = renderHook(() => useGameRuntime("finish-game"));
    act(() => {
      result.current.beginRun("standard");
    });
    act(() => {
      result.current.finishRun({ mode: "standard", status: "completed", score: 900 });
    });

    expect(result.current.progress).toMatchObject({
      bestScore: 900,
      sessionsCompleted: 1,
    });
    expect(result.current.saveSlot).toBeUndefined();
  });

  test("abandonRun is a no-op without a slug, undefined with no active run, and records abandonment with one", () => {
    const { result: noSlug } = renderHook(() => useGameRuntime());
    let returned: unknown;
    act(() => {
      returned = noSlug.current.abandonRun();
    });
    expect(returned).toBeUndefined();

    const { result } = renderHook(() => useGameRuntime("abandon-game"));
    act(() => {
      returned = result.current.abandonRun();
    });
    expect(returned).toBeUndefined();

    act(() => {
      result.current.beginRun("cozy");
    });
    act(() => {
      returned = result.current.abandonRun({ summary: "bailed" });
    });

    expect(result.current.progress).toMatchObject({ sessionsAbandoned: 1 });
    expect(result.current.saveSlot).toBeUndefined();
    expect((returned as { result: { status: string } }).result.status).toBe("abandoned");
  });

  test("re-runs the load effect when slug or namespace changes", () => {
    const { result, rerender } = renderHook(
      ({ slug, namespace }: { slug?: string; namespace?: string }) =>
        useGameRuntime(slug, { namespace }),
      { initialProps: { slug: "slug-a", namespace: "ns-a" } }
    );

    act(() => {
      result.current.beginRun("standard", { progressSummary: "A" });
    });
    expect(result.current.saveSlot).toMatchObject({ progressSummary: "A" });

    rerender({ slug: "slug-b", namespace: "ns-a" });

    expect(result.current.saveSlot).toBeUndefined();
    // a fresh slug has no persisted progress yet, so it reads back the
    // normalized empty-progress shape rather than the "slug-a" state.
    expect(result.current.progress).toMatchObject({ slug: "slug-b", sessionsStarted: 0 });
  });
});

describe("applySettingsToDocument", () => {
  beforeEach(() => {
    delete document.documentElement.dataset.reducedMotion;
    delete document.documentElement.dataset.graphicsQuality;
    delete document.documentElement.dataset.handedness;
  });

  test("normalizes and writes settings onto the document element", () => {
    applySettingsToDocument({
      ...DEFAULT_GAME_SETTINGS,
      graphicsQuality: "low",
      handedness: "left",
      reducedMotion: true,
      textScale: 1.1,
      joystickSensitivity: 0.8,
    });

    expect(document.documentElement.dataset.reducedMotion).toBe("true");
    expect(document.documentElement.dataset.graphicsQuality).toBe("low");
    expect(document.documentElement.dataset.handedness).toBe("left");
    expect(document.documentElement.style.getPropertyValue("--game-text-scale")).toBe("1.1");
    expect(document.documentElement.style.getPropertyValue("--game-joystick-sensitivity")).toBe(
      "0.8"
    );
  });

  test("defaults to reading settings from storage when called with no argument", () => {
    localStorage.clear();
    applySettingsToDocument();

    expect(document.documentElement.dataset.graphicsQuality).toBe(
      DEFAULT_GAME_SETTINGS.graphicsQuality
    );
  });
});

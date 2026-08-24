import { describe, expect, test } from "vitest";
import {
  createActiveSaveSlot,
  createEmptyProgress,
  createGameResult,
  markProgressStarted,
  normalizeGameProgress,
  normalizeGameSaveSlot,
  normalizeGameSettings,
  recordGameResult,
  updateActiveSaveSlot,
} from "../src/runtime";

describe("session-runtime models", () => {
  test("normalizes settings to local-only safe defaults", () => {
    expect(
      normalizeGameSettings({
        graphicsQuality: "ultra" as never,
        handedness: "left",
        hapticsEnabled: false,
        joystickSensitivity: 8,
        reducedMotion: true,
        textScale: 0.2,
      })
    ).toEqual({
      graphicsQuality: "balanced",
      handedness: "left",
      hapticsEnabled: false,
      joystickSensitivity: 1.6,
      reducedMotion: true,
      soundEnabled: true,
      textScale: 0.9,
    });
  });

  test("tracks started sessions and finished results deterministically", () => {
    const started = markProgressStarted(
      createEmptyProgress("mega-track", "cozy", new Date("2026-04-22T12:00:00.000Z")),
      "challenge",
      new Date("2026-04-22T12:01:00.000Z")
    );

    const result = createGameResult({
      endedAt: "2026-04-22T12:11:00.000Z",
      mode: "challenge",
      score: 4200,
      slug: "mega-track",
      startedAt: "2026-04-22T12:01:00.000Z",
      status: "completed",
      summary: "Cup cleared",
    });

    const progress = recordGameResult(started, result, ["first-cup"]);

    expect(progress.sessionsStarted).toBe(1);
    expect(progress.sessionsCompleted).toBe(1);
    expect(progress.bestScore).toBe(4200);
    expect(progress.totalPlayMs).toBe(600_000);
    expect(progress.milestones).toEqual(["first-cup"]);
    expect(progress.lastSelectedMode).toBe("challenge");
  });

  test("recordGameResult increments failed and abandoned counters instead of completed", () => {
    const empty = createEmptyProgress("mega-track");

    const failed = recordGameResult(
      empty,
      createGameResult({
        slug: "mega-track",
        mode: "standard",
        status: "failed",
        score: 10,
        startedAt: new Date("2026-04-22T12:00:00.000Z"),
        endedAt: new Date("2026-04-22T12:01:00.000Z"),
      })
    );
    expect(failed.sessionsFailed).toBe(1);
    expect(failed.sessionsCompleted).toBe(0);
    expect(failed.sessionsAbandoned).toBe(0);

    const abandoned = recordGameResult(
      empty,
      createGameResult({
        slug: "mega-track",
        mode: "standard",
        status: "abandoned",
        score: 10,
        startedAt: new Date("2026-04-22T12:00:00.000Z"),
        endedAt: new Date("2026-04-22T12:01:00.000Z"),
      })
    );
    expect(abandoned.sessionsAbandoned).toBe(1);
    expect(abandoned.sessionsCompleted).toBe(0);
    expect(abandoned.sessionsFailed).toBe(0);
  });

  test("createEmptyProgress defaults to standard mode when none is given", () => {
    expect(createEmptyProgress("mega-track").lastSelectedMode).toBe("standard");
  });

  test("normalizes persisted progress and save slots by current game slug", () => {
    const progress = normalizeGameProgress("farm-follies", {
      bestScore: -2,
      lastSelectedMode: "invalid" as never,
      sessionsStarted: 2.8,
      updatedAt: "2026-04-22T12:00:00.000Z",
    });

    expect(progress.slug).toBe("farm-follies");
    expect(progress.bestScore).toBe(0);
    expect(progress.lastSelectedMode).toBe("standard");
    expect(progress.sessionsStarted).toBe(2);

    const slot = normalizeGameSaveSlot("farm-follies", {
      mode: "cozy",
      progressSummary: "Tier 5 tower",
      status: "active",
    });

    expect(slot).toMatchObject({
      mode: "cozy",
      progressSummary: "Tier 5 tower",
      slug: "farm-follies",
      status: "active",
    });
  });

  test("normalizeGameSaveSlot rejects non-active or missing values and fills in blank fields", () => {
    expect(normalizeGameSaveSlot("farm-follies", undefined)).toBeUndefined();
    expect(normalizeGameSaveSlot("farm-follies", { status: undefined })).toBeUndefined();
    expect(
      normalizeGameSaveSlot("farm-follies", {
        status: "active",
        label: "",
        progressSummary: "",
      } as never)
    ).toMatchObject({
      label: "Resume Run",
      progressSummary: "Run in progress",
    });
  });

  test("normalizeGameProgress drops a lastResult whose status is unfinished or missing", () => {
    const progress = normalizeGameProgress("farm-follies", {
      lastResult: { status: "active" } as never,
    });

    expect(progress.lastResult).toBeUndefined();
  });

  test("normalizeGameProgress folds in a finished lastResult, defaulting its summary and duration", () => {
    const progress = normalizeGameProgress("farm-follies", {
      lastResult: {
        status: "failed",
        startedAt: "2026-04-22T12:00:00.000Z",
        endedAt: "2026-04-22T12:05:00.000Z",
        score: 40,
      } as never,
    });

    expect(progress.lastResult).toMatchObject({
      slug: "farm-follies",
      status: "failed",
      summary: "Run ended",
      durationMs: 300_000,
    });
  });

  test("createGameResult falls back to a default summary per status", () => {
    expect(
      createGameResult({
        slug: "s",
        mode: "standard",
        status: "completed",
        score: 1,
        startedAt: new Date(),
      }).summary
    ).toBe("Run complete");
    expect(
      createGameResult({
        slug: "s",
        mode: "standard",
        status: "failed",
        score: 1,
        startedAt: new Date(),
      }).summary
    ).toBe("Run ended");
    expect(
      createGameResult({
        slug: "s",
        mode: "standard",
        status: "abandoned",
        score: 1,
        startedAt: new Date(),
      }).summary
    ).toBe("Run abandoned");
  });

  test("createGameResult and normalizeGameProgress treat an unparsable date as the epoch instead of throwing", () => {
    const result = createGameResult({
      slug: "s",
      mode: "standard",
      status: "completed",
      score: 1,
      startedAt: "not-a-date",
      endedAt: "also-not-a-date",
    });

    expect(result.startedAt).toBe(new Date(0).toISOString());
    expect(result.endedAt).toBe(new Date(0).toISOString());
    expect(result.durationMs).toBe(0);
  });

  test("createGameResult omits stats when none are given, and includes them verbatim when given", () => {
    const withoutStats = createGameResult({
      slug: "s",
      mode: "standard",
      status: "completed",
      score: 1,
      startedAt: new Date("2026-04-22T12:00:00.000Z"),
    });
    expect(withoutStats.stats).toBeUndefined();

    const withStats = createGameResult({
      slug: "s",
      mode: "standard",
      status: "completed",
      score: 1,
      startedAt: new Date("2026-04-22T12:00:00.000Z"),
      stats: { orbsCollected: 12, cleanRun: true },
    });
    expect(withStats.stats).toEqual({ orbsCollected: 12, cleanRun: true });
  });

  test("normalizeGameProgress defaults a finished lastResult's missing startedAt/endedAt to now", () => {
    const progress = normalizeGameProgress("mega-track", {
      lastResult: {
        status: "completed",
        score: 1,
      } as never,
    });

    expect(progress.lastResult).toBeDefined();
    expect(progress.lastResult?.startedAt).toBe(progress.lastResult?.endedAt);
    expect(Number.isNaN(new Date(progress.lastResult?.startedAt ?? "").getTime())).toBe(false);
  });

  test("normalizeGameProgress preserves an explicit durationMs on a finished lastResult instead of recomputing it", () => {
    const progress = normalizeGameProgress("mega-track", {
      lastResult: {
        status: "completed",
        startedAt: "2026-04-22T12:00:00.000Z",
        endedAt: "2026-04-22T12:05:00.000Z",
        durationMs: 999,
        score: 1,
        stats: { hits: 3 },
      } as never,
    });

    expect(progress.lastResult?.durationMs).toBe(999);
    expect(progress.lastResult?.stats).toEqual({ hits: 3 });
  });

  test("updateActiveSaveSlot patches fields, re-normalizes the mode, and bumps updatedAt", () => {
    const slot = createActiveSaveSlot({
      slug: "bioluminescent-sea",
      mode: "standard",
      now: new Date("2026-04-22T12:00:00.000Z"),
    });

    const next = updateActiveSaveSlot(
      slot,
      { mode: "invalid" as never, progressSummary: "Deeper" },
      new Date("2026-04-22T12:05:00.000Z")
    );

    expect(next).toMatchObject({
      mode: "standard",
      progressSummary: "Deeper",
      updatedAt: "2026-04-22T12:05:00.000Z",
    });
  });

  test("creates active save slots for resume flow", () => {
    expect(
      createActiveSaveSlot({
        label: "Resume Standard Run",
        mode: "standard",
        now: new Date("2026-04-22T12:00:00.000Z"),
        progressSummary: "Landmark 1",
        slug: "bioluminescent-sea",
        snapshot: { glow: 18 },
      })
    ).toEqual({
      label: "Resume Standard Run",
      mode: "standard",
      progressSummary: "Landmark 1",
      slug: "bioluminescent-sea",
      snapshot: { glow: 18 },
      startedAt: "2026-04-22T12:00:00.000Z",
      status: "active",
      updatedAt: "2026-04-22T12:00:00.000Z",
    });
  });
});

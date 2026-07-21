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

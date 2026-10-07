// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import {
  abandonGameRun,
  beginGameRun,
  clearGameSaveSlot,
  finishGameRun,
  readGameProgress,
  readGameSaveSlot,
  readGameSettings,
  updateGameRun,
  writeGameSettings,
} from "../src/react";

describe("game-session browser storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("persists settings locally", () => {
    writeGameSettings({
      graphicsQuality: "high",
      handedness: "left",
      hapticsEnabled: false,
      joystickSensitivity: 1.2,
      reducedMotion: true,
      soundEnabled: false,
      textScale: 1.15,
    });

    expect(readGameSettings()).toMatchObject({
      graphicsQuality: "high",
      handedness: "left",
      hapticsEnabled: false,
      reducedMotion: true,
      soundEnabled: false,
    });
  });

  test("starts and clears one active run per game", () => {
    beginGameRun("puzzle-quest", "challenge", {
      progressSummary: "Round 2 rescue",
      snapshot: { saladHealth: 72 },
    });

    expect(readGameProgress("puzzle-quest")).toMatchObject({
      lastSelectedMode: "challenge",
      sessionsStarted: 1,
    });
    expect(readGameSaveSlot("puzzle-quest")).toMatchObject({
      mode: "challenge",
      progressSummary: "Round 2 rescue",
      snapshot: { saladHealth: 72 },
      status: "active",
    });

    clearGameSaveSlot("puzzle-quest");

    expect(readGameSaveSlot("puzzle-quest")).toBeUndefined();
  });

  test("uses a caller-supplied label instead of the mode-derived default", () => {
    beginGameRun("puzzle-quest", "challenge", {
      label: "Continue Rescue",
      progressSummary: "Round 2 rescue",
    });

    expect(readGameSaveSlot("puzzle-quest")).toMatchObject({
      label: "Continue Rescue",
    });
  });

  test("finishes a run, records progress, and clears stale resume state", () => {
    beginGameRun("track-day", "standard", {
      progressSummary: "Leg 2",
      snapshot: { integrity: 74 },
    });

    const { progress, result } = finishGameRun("track-day", {
      milestones: ["first-cup"],
      mode: "standard",
      now: new Date("2026-04-22T12:12:00.000Z"),
      score: 7200,
      status: "completed",
      summary: "Cup complete",
    });

    expect(result).toMatchObject({
      mode: "standard",
      score: 7200,
      slug: "track-day",
      status: "completed",
      summary: "Cup complete",
    });
    expect(progress).toMatchObject({
      bestScore: 7200,
      sessionsCompleted: 1,
      sessionsStarted: 1,
    });
    expect(progress.milestones).toEqual(["first-cup"]);
    expect(readGameSaveSlot("track-day")).toBeUndefined();
  });

  test("updates the active save slot with resumable run details", () => {
    beginGameRun("ice-climb", "standard", {
      progressSummary: "Segment 1",
    });

    const slot = updateGameRun("ice-climb", {
      progressSummary: "Segment 3 · 76% warmth",
      snapshot: { segmentIndex: 2, warmth: 76 },
    });

    expect(slot).toMatchObject({
      progressSummary: "Segment 3 · 76% warmth",
      snapshot: { segmentIndex: 2, warmth: 76 },
      status: "active",
    });
    expect(readGameSaveSlot("ice-climb")).toMatchObject({
      progressSummary: "Segment 3 · 76% warmth",
      snapshot: { segmentIndex: 2, warmth: 76 },
    });
  });

  test("abandons an active run from the pause menu and records it as progress", () => {
    beginGameRun("harvest-hop", "cozy", {
      progressSummary: "Tier 4 tower",
      snapshot: { height: 18 },
    });

    const result = abandonGameRun("harvest-hop", {
      now: new Date("2026-04-22T12:30:00.000Z"),
      summary: "Quit from pause menu",
    });

    expect(result?.result).toMatchObject({
      mode: "cozy",
      score: 0,
      slug: "harvest-hop",
      status: "abandoned",
      summary: "Quit from pause menu",
    });
    expect(result?.progress).toMatchObject({
      sessionsAbandoned: 1,
      sessionsStarted: 1,
    });
    expect(readGameSaveSlot("harvest-hop")).toBeUndefined();
  });

  test("namespaces storage keys so multiple apps on one origin don't collide", () => {
    beginGameRun("track-day", "standard", { progressSummary: "App A" }, undefined, "app-a:v1");
    beginGameRun("track-day", "standard", { progressSummary: "App B" }, undefined, "app-b:v1");

    expect(readGameSaveSlot("track-day", undefined, "app-a:v1")).toMatchObject({
      progressSummary: "App A",
    });
    expect(readGameSaveSlot("track-day", undefined, "app-b:v1")).toMatchObject({
      progressSummary: "App B",
    });
  });
});

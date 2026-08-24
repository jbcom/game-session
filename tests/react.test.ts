// @vitest-environment jsdom
import { beforeEach, describe, expect, test } from "vitest";
import {
  abandonGameRun,
  beginGameRun,
  clearGameSaveSlot,
  finishGameRun,
  readCabinetSettings,
  readGameProgress,
  readGameSaveSlot,
  updateGameRun,
  writeCabinetSettings,
} from "../src/react";

describe("session-runtime browser storage", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  test("persists settings locally", () => {
    writeCabinetSettings({
      graphicsQuality: "high",
      handedness: "left",
      hapticsEnabled: false,
      joystickSensitivity: 1.2,
      reducedMotion: true,
      soundEnabled: false,
      textScale: 1.15,
    });

    expect(readCabinetSettings()).toMatchObject({
      graphicsQuality: "high",
      handedness: "left",
      hapticsEnabled: false,
      reducedMotion: true,
      soundEnabled: false,
    });
  });

  test("starts and clears one active run per game", () => {
    beginGameRun("otterly-chaotic", "challenge", {
      progressSummary: "Round 2 rescue",
      snapshot: { saladHealth: 72 },
    });

    expect(readGameProgress("otterly-chaotic")).toMatchObject({
      lastSelectedMode: "challenge",
      sessionsStarted: 1,
    });
    expect(readGameSaveSlot("otterly-chaotic")).toMatchObject({
      mode: "challenge",
      progressSummary: "Round 2 rescue",
      snapshot: { saladHealth: 72 },
      status: "active",
    });

    clearGameSaveSlot("otterly-chaotic");

    expect(readGameSaveSlot("otterly-chaotic")).toBeUndefined();
  });

  test("uses a caller-supplied label instead of the mode-derived default", () => {
    beginGameRun("otterly-chaotic", "challenge", {
      label: "Continue Rescue",
      progressSummary: "Round 2 rescue",
    });

    expect(readGameSaveSlot("otterly-chaotic")).toMatchObject({
      label: "Continue Rescue",
    });
  });

  test("finishes a run, records progress, and clears stale resume state", () => {
    beginGameRun("mega-track", "standard", {
      progressSummary: "Leg 2",
      snapshot: { integrity: 74 },
    });

    const { progress, result } = finishGameRun("mega-track", {
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
      slug: "mega-track",
      status: "completed",
      summary: "Cup complete",
    });
    expect(progress).toMatchObject({
      bestScore: 7200,
      sessionsCompleted: 1,
      sessionsStarted: 1,
    });
    expect(progress.milestones).toEqual(["first-cup"]);
    expect(readGameSaveSlot("mega-track")).toBeUndefined();
  });

  test("updates the active save slot with resumable run details", () => {
    beginGameRun("overcast-glacier", "standard", {
      progressSummary: "Segment 1",
    });

    const slot = updateGameRun("overcast-glacier", {
      progressSummary: "Segment 3 · 76% warmth",
      snapshot: { segmentIndex: 2, warmth: 76 },
    });

    expect(slot).toMatchObject({
      progressSummary: "Segment 3 · 76% warmth",
      snapshot: { segmentIndex: 2, warmth: 76 },
      status: "active",
    });
    expect(readGameSaveSlot("overcast-glacier")).toMatchObject({
      progressSummary: "Segment 3 · 76% warmth",
      snapshot: { segmentIndex: 2, warmth: 76 },
    });
  });

  test("abandons an active run from the pause menu and records it as progress", () => {
    beginGameRun("farm-follies", "cozy", {
      progressSummary: "Tier 4 tower",
      snapshot: { height: 18 },
    });

    const result = abandonGameRun("farm-follies", {
      now: new Date("2026-04-22T12:30:00.000Z"),
      summary: "Quit from pause menu",
    });

    expect(result?.result).toMatchObject({
      mode: "cozy",
      score: 0,
      slug: "farm-follies",
      status: "abandoned",
      summary: "Quit from pause menu",
    });
    expect(result?.progress).toMatchObject({
      sessionsAbandoned: 1,
      sessionsStarted: 1,
    });
    expect(readGameSaveSlot("farm-follies")).toBeUndefined();
  });

  test("namespaces storage keys so multiple apps on one origin don't collide", () => {
    beginGameRun("mega-track", "standard", { progressSummary: "App A" }, undefined, "app-a:v1");
    beginGameRun("mega-track", "standard", { progressSummary: "App B" }, undefined, "app-b:v1");

    expect(readGameSaveSlot("mega-track", undefined, "app-a:v1")).toMatchObject({
      progressSummary: "App A",
    });
    expect(readGameSaveSlot("mega-track", undefined, "app-b:v1")).toMatchObject({
      progressSummary: "App B",
    });
  });
});

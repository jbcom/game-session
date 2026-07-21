import { describe, expect, test } from "vitest";
import {
  DEFAULT_SESSION_TUNING,
  getSessionTuning,
  normalizeSessionMode,
  SESSION_MODES,
} from "../src/sessionMode";

describe("session mode tuning", () => {
  test("normalizes unknown values to the default cabinet mode", () => {
    expect(normalizeSessionMode("cozy")).toBe("cozy");
    expect(normalizeSessionMode("challenge")).toBe("challenge");
    expect(normalizeSessionMode("broken")).toBe("standard");
    expect(normalizeSessionMode(undefined)).toBe("standard");
  });

  test("defines tuning for all three session modes", () => {
    expect(Object.keys(DEFAULT_SESSION_TUNING).sort()).toEqual([...SESSION_MODES].sort());
  });

  test("keeps standard mode couch-friendly and challenge opt-in by default", () => {
    const cozy = getSessionTuning("cozy");
    const standard = getSessionTuning("standard");
    const challenge = getSessionTuning("challenge");

    expect(standard.targetMinutes).toEqual([8, 15]);
    expect(standard.minimumNoInputGraceMs).toBeGreaterThanOrEqual(60_000);
    expect(standard.mistakeRecoveryCount).toBeGreaterThanOrEqual(2);
    expect(cozy.pressureScale).toBeLessThan(standard.pressureScale);
    expect(cozy.recoveryScale).toBeGreaterThan(standard.recoveryScale);
    expect(challenge.pressureScale).toBeGreaterThan(standard.pressureScale);
    expect(challenge.recoveryScale).toBeLessThan(standard.recoveryScale);
  });

  test("resolves tuning from a caller-supplied per-game override table", () => {
    const overrides = {
      cozy: { ...DEFAULT_SESSION_TUNING.cozy, targetMinutes: [20, 30] as const },
      standard: DEFAULT_SESSION_TUNING.standard,
      challenge: DEFAULT_SESSION_TUNING.challenge,
    };

    expect(getSessionTuning("cozy", overrides).targetMinutes).toEqual([20, 30]);
    expect(getSessionTuning("cozy")).toEqual(DEFAULT_SESSION_TUNING.cozy);
  });
});

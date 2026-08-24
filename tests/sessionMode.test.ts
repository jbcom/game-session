import { describe, expect, test } from "vitest";
import {
  DEFAULT_SESSION_TUNING,
  getSessionPressureScale,
  getSessionRecoveryScale,
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

  test("getSessionPressureScale reads the default table and accepts an override table", () => {
    expect(getSessionPressureScale("challenge")).toBe(
      DEFAULT_SESSION_TUNING.challenge.pressureScale
    );
    expect(getSessionPressureScale("cozy")).toBe(DEFAULT_SESSION_TUNING.cozy.pressureScale);
    expect(getSessionPressureScale(undefined)).toBe(DEFAULT_SESSION_TUNING.standard.pressureScale);

    expect(getSessionPressureScale("challenge", { challenge: 9, cozy: 1, standard: 1 })).toBe(9);
  });

  test("getSessionRecoveryScale reads the default table and accepts an override table", () => {
    expect(getSessionRecoveryScale("challenge")).toBe(
      DEFAULT_SESSION_TUNING.challenge.recoveryScale
    );
    expect(getSessionRecoveryScale("cozy")).toBe(DEFAULT_SESSION_TUNING.cozy.recoveryScale);
    expect(getSessionRecoveryScale(undefined)).toBe(DEFAULT_SESSION_TUNING.standard.recoveryScale);

    expect(getSessionRecoveryScale("cozy", { challenge: 1, cozy: 8, standard: 1 })).toBe(8);
  });
});

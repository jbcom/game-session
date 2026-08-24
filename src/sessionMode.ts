export const SESSION_MODES = ["cozy", "standard", "challenge"] as const;

export type SessionMode = (typeof SESSION_MODES)[number];

export const DEFAULT_SESSION_MODE: SessionMode = "standard";

export interface DifficultyVariant {
  mode: SessionMode;
  label: string;
  description: string;
}

export interface GameSessionCatalogFields {
  coreMessage: string;
  coreLoop: string;
  sessionTarget: string;
  pressureType: string;
  defaultControls: string;
  winReplayPromise: string;
  difficultyVariants: readonly DifficultyVariant[];
}

export interface SessionTuning {
  mode: SessionMode;
  targetMinutes: readonly [number, number];
  minimumNoInputGraceMs: number;
  mistakeRecoveryCount: number;
  pressureScale: number;
  recoveryScale: number;
  description: string;
}

export const DEFAULT_DIFFICULTY_VARIANTS: readonly DifficultyVariant[] = [
  {
    mode: "cozy",
    label: "Cozy",
    description: "More recovery, slower pressure, and room to learn the loop.",
  },
  {
    mode: "standard",
    label: "Standard",
    description: "The intended couch session: readable pressure with recoverable mistakes.",
  },
  {
    mode: "challenge",
    label: "Challenge",
    description: "Sharper hazards and tighter recovery for replay mastery.",
  },
];

/**
 * Default per-mode tuning. Consumers that need per-game tuning overrides
 * (a host app's own tuning registry) should
 * build their own `Record<string, Record<SessionMode, SessionTuning>>` on
 * top of this — that registry is app-specific, not part of this package.
 */
export const DEFAULT_SESSION_TUNING: Record<SessionMode, SessionTuning> = {
  cozy: {
    mode: "cozy",
    targetMinutes: [10, 18],
    minimumNoInputGraceMs: 120_000,
    mistakeRecoveryCount: 4,
    pressureScale: 0.62,
    recoveryScale: 1.45,
    description: "Longer arc, gentler loss curves, and extra recovery valves.",
  },
  standard: {
    mode: "standard",
    targetMinutes: [8, 15],
    minimumNoInputGraceMs: 60_000,
    mistakeRecoveryCount: 2,
    pressureScale: 1,
    recoveryScale: 1,
    description: "Default cabinet tuning for an 8-15 minute replayable run.",
  },
  challenge: {
    mode: "challenge",
    targetMinutes: [6, 12],
    minimumNoInputGraceMs: 25_000,
    mistakeRecoveryCount: 1,
    pressureScale: 1.45,
    recoveryScale: 0.72,
    description: "Opt-in pressure with denser hazards and fewer safety nets.",
  },
};

export function normalizeSessionMode(mode: string | null | undefined): SessionMode {
  return SESSION_MODES.includes(mode as SessionMode) ? (mode as SessionMode) : DEFAULT_SESSION_MODE;
}

/**
 * Resolve tuning for a mode, optionally overridden per-game via a caller-supplied
 * tuning table (e.g. a game slug -> per-mode SessionTuning map). Falls back to
 * DEFAULT_SESSION_TUNING when no table/entry is given.
 */
export function getSessionTuning(
  mode: string | null | undefined,
  overrides?: Record<SessionMode, SessionTuning>
): SessionTuning {
  const normalized = normalizeSessionMode(mode);
  return (overrides ?? DEFAULT_SESSION_TUNING)[normalized];
}

export function getSessionPressureScale(
  mode: string | null | undefined,
  values: Record<SessionMode, number> = {
    challenge: DEFAULT_SESSION_TUNING.challenge.pressureScale,
    cozy: DEFAULT_SESSION_TUNING.cozy.pressureScale,
    standard: DEFAULT_SESSION_TUNING.standard.pressureScale,
  }
) {
  return values[normalizeSessionMode(mode)];
}

export function getSessionRecoveryScale(
  mode: string | null | undefined,
  values: Record<SessionMode, number> = {
    challenge: DEFAULT_SESSION_TUNING.challenge.recoveryScale,
    cozy: DEFAULT_SESSION_TUNING.cozy.recoveryScale,
    standard: DEFAULT_SESSION_TUNING.standard.recoveryScale,
  }
) {
  return values[normalizeSessionMode(mode)];
}

/** The three difficulty postures every game built on this package can offer. */
export const SESSION_MODES = ["cozy", "standard", "challenge"] as const;

/** One of the three session modes: `"cozy"`, `"standard"`, or `"challenge"`. */
export type SessionMode = (typeof SESSION_MODES)[number];

/** The mode a game should start in and fall back to whenever no valid mode is known. */
export const DEFAULT_SESSION_MODE: SessionMode = "standard";

/**
 * The player-facing copy for one {@link SessionMode} on a difficulty-select
 * screen -- a label and a one-line description of what that mode changes.
 */
export interface DifficultyVariant {
  /** Which session mode this variant describes. */
  mode: SessionMode;
  /** Short player-facing name, e.g. `"Cozy"`. */
  label: string;
  /** One sentence explaining what picking this mode changes about the run. */
  description: string;
}

/**
 * Descriptive metadata for a game's session catalog entry -- the copy a
 * cabinet menu or game-select screen needs to introduce a title before the
 * player starts a run. Not persisted or read by this package; consumers
 * define and pass their own values.
 */
export interface GameSessionCatalogFields {
  /** The game's core pitch in one sentence. */
  coreMessage: string;
  /** A short description of the moment-to-moment gameplay loop. */
  coreLoop: string;
  /** Human-readable expected session length, e.g. `"8-15 minutes"`. */
  sessionTarget: string;
  /** What kind of pressure drives the run (timer, hazards, resource decay, etc). */
  pressureType: string;
  /** Human-readable summary of the default control scheme. */
  defaultControls: string;
  /** What replaying the game (a new run) promises the player. */
  winReplayPromise: string;
  /** The difficulty options to present, one per {@link SessionMode}. */
  difficultyVariants: readonly DifficultyVariant[];
}

/**
 * Numeric tuning for one {@link SessionMode} -- the values a game's hazard,
 * pacing, and mistake-forgiveness systems read instead of hardcoding their
 * own per-difficulty constants.
 */
export interface SessionTuning {
  /** Which session mode this tuning applies to. */
  mode: SessionMode;
  /** Expected run length in minutes, as an inclusive `[min, max]` range. */
  targetMinutes: readonly [number, number];
  /** How long (ms) the game should tolerate no player input before nudging or failing. */
  minimumNoInputGraceMs: number;
  /** How many mistakes the run should forgive before real consequences apply. */
  mistakeRecoveryCount: number;
  /** Multiplier a game applies to its base hazard/spawn rate for this mode. */
  pressureScale: number;
  /** Multiplier a game applies to its base recovery/healing rate for this mode. */
  recoveryScale: number;
  /** One sentence describing the overall feel of this mode. */
  description: string;
}

/**
 * Default player-facing copy for the three session modes. A starting point
 * for a difficulty-select UI; games with their own voice should build a
 * replacement array in the same shape rather than mutating this one.
 */
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

/**
 * Coerce arbitrary input (a URL param, a stale localStorage value, `undefined`)
 * to a valid {@link SessionMode}. Anything not exactly `"cozy"`, `"standard"`,
 * or `"challenge"` resolves to {@link DEFAULT_SESSION_MODE} ("standard"), so
 * callers never need to guard the input themselves.
 *
 * @param mode - Untrusted candidate mode value, or `null`/`undefined`.
 * @returns A valid `SessionMode`, always.
 */
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

/**
 * Convenience accessor for just a mode's hazard-pressure multiplier, without
 * pulling the whole {@link SessionTuning} record. Normalizes `mode` the same
 * way {@link getSessionTuning} does.
 *
 * @param mode - Untrusted candidate mode value, or `null`/`undefined`.
 * @param values - Optional per-mode pressure-scale table to read from instead
 *   of {@link DEFAULT_SESSION_TUNING}'s values (e.g. a game's own tuning override).
 * @returns The `pressureScale` for the normalized mode.
 */
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

/**
 * Convenience accessor for just a mode's recovery-rate multiplier, without
 * pulling the whole {@link SessionTuning} record. Normalizes `mode` the same
 * way {@link getSessionTuning} does.
 *
 * @param mode - Untrusted candidate mode value, or `null`/`undefined`.
 * @param values - Optional per-mode recovery-scale table to read from instead
 *   of {@link DEFAULT_SESSION_TUNING}'s values (e.g. a game's own tuning override).
 * @returns The `recoveryScale` for the normalized mode.
 */
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

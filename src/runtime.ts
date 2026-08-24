import { DEFAULT_SESSION_MODE, normalizeSessionMode, type SessionMode } from "./sessionMode.js";

/**
 * The lifecycle status of a run. `"active"` is only ever the state of a
 * {@link GameSaveSlot} in progress; a finished {@link GameResult} is always
 * one of the other three (see `Exclude<GameRunStatus, "active">` on that type).
 */
export type GameRunStatus = "active" | "completed" | "failed" | "abandoned";

/** A game's rendering-quality tier, as picked in {@link GameSettings}. */
export type GraphicsQuality = "low" | "balanced" | "high";

/** Which hand a player favors, for mirroring on-screen controls in {@link GameSettings}. */
export type Handedness = "left" | "right";

/**
 * Any JSON-serializable value. The type of {@link GameSaveSlot.snapshot} --
 * a game defines its own concrete shape for that field and narrows to it on read.
 */
export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableValue[]
  | { [key: string]: SerializableValue };

/**
 * The outcome of one finished run, produced by {@link createGameResult} and
 * folded into a game's {@link GameProgress} by {@link recordGameResult}.
 */
export interface GameResult {
  /** The game this result belongs to. */
  slug: string;
  /** The session mode the run was played in. */
  mode: SessionMode;
  /** How the run ended. Never `"active"` -- that status only applies to a {@link GameSaveSlot}. */
  status: Exclude<GameRunStatus, "active">;
  /** The run's score. Always a non-negative integer. */
  score: number;
  /** ISO 8601 timestamp of when the run started. */
  startedAt: string;
  /** ISO 8601 timestamp of when the run ended. */
  endedAt: string;
  /** Wall-clock run length in milliseconds, derived from `startedAt`/`endedAt`. */
  durationMs: number;
  /** Short player-facing summary of the run, e.g. `"Cup complete"`. */
  summary: string;
  /** Optional free-form per-run stats a game wants to remember (e.g. `{ orbsCollected: 12 }`). */
  stats?: Record<string, number | string | boolean>;
}

/**
 * A game's persisted lifetime record -- best score, session counters, total
 * play time, and the most recent finished run. One `GameProgress` exists per
 * game slug; read/write it via {@link readGameProgress}/{@link writeGameProgress}
 * (or the storage-agnostic {@link normalizeGameProgress}/{@link createEmptyProgress}).
 */
export interface GameProgress {
  /** The game this progress record belongs to. */
  slug: string;
  /** The session mode the player most recently started or finished a run in. */
  lastSelectedMode: SessionMode;
  /** The highest score recorded across all finished runs. */
  bestScore: number;
  /** How many runs have been started, via {@link markProgressStarted}. */
  sessionsStarted: number;
  /** How many runs finished with `status: "completed"`. */
  sessionsCompleted: number;
  /** How many runs finished with `status: "failed"`. */
  sessionsFailed: number;
  /** How many runs finished with `status: "abandoned"`. */
  sessionsAbandoned: number;
  /** Cumulative duration, in milliseconds, of every finished run. */
  totalPlayMs: number;
  /** The most recently recorded finished run, if any. */
  lastResult?: GameResult;
  /** ISO 8601 timestamp of the last time this record changed. */
  updatedAt: string;
  /** Milestone identifiers the player has unlocked, deduplicated. Order is not meaningful. */
  milestones: string[];
}

/**
 * A player's cross-game settings -- audio, motion, graphics tier, handedness,
 * and input tuning. One record applies to every game sharing a storage
 * namespace; see {@link readCabinetSettings}/{@link writeCabinetSettings}.
 */
export interface GameSettings {
  /** Whether sound effects and music should play. */
  soundEnabled: boolean;
  /** Whether haptic/vibration feedback should fire on supported devices. */
  hapticsEnabled: boolean;
  /** Whether to suppress large motion/parallax/screen-shake effects. */
  reducedMotion: boolean;
  /** The rendering-quality tier to target. */
  graphicsQuality: GraphicsQuality;
  /** Which hand on-screen controls should favor. */
  handedness: Handedness;
  /** Virtual-joystick sensitivity multiplier. Clamped to `[0.65, 1.6]` by {@link normalizeGameSettings}. */
  joystickSensitivity: number;
  /** UI text-size multiplier. Clamped to `[0.9, 1.25]` by {@link normalizeGameSettings}. */
  textScale: number;
}

/**
 * A resumable in-progress run for one game, persisted so the player can
 * leave and come back. Created by {@link createActiveSaveSlot}, updated by
 * {@link updateActiveSaveSlot}, and cleared once the run finishes (see
 * {@link finishGameRun} in `./react`).
 */
export interface GameSaveSlot {
  /** The game this save slot belongs to. */
  slug: string;
  /** The session mode the run is being played in. */
  mode: SessionMode;
  /** Always `"active"` -- a finished run has no save slot, it becomes a {@link GameResult} instead. */
  status: "active";
  /** Player-facing label for a "resume" UI, e.g. `"Resume Standard Run"`. */
  label: string;
  /** ISO 8601 timestamp of when the run began. */
  startedAt: string;
  /** ISO 8601 timestamp of the slot's last update. */
  updatedAt: string;
  /** Short player-facing description of how far the run has gotten. */
  progressSummary: string;
  /** Optional game-defined snapshot of in-run state, for resuming mid-level. */
  snapshot?: SerializableValue;
}

/** The settings every new player starts with, before any {@link GameSettings} are persisted. */
export const DEFAULT_GAME_SETTINGS: GameSettings = {
  soundEnabled: true,
  hapticsEnabled: true,
  reducedMotion: false,
  graphicsQuality: "balanced",
  handedness: "right",
  joystickSensitivity: 1,
  textScale: 1,
};

/**
 * Coerce arbitrary input -- a corrupted or older-shaped localStorage value,
 * `undefined`, a partial object -- into a fully valid {@link GameSettings}.
 * Every field falls back to its {@link DEFAULT_GAME_SETTINGS} value when
 * missing or of the wrong shape; numeric fields are clamped to their valid
 * range rather than rejected.
 *
 * @param value - Untrusted candidate settings, or `null`/`undefined`.
 * @returns A fully populated, valid `GameSettings`.
 */
export function normalizeGameSettings(
  value: Partial<GameSettings> | null | undefined
): GameSettings {
  const settings = value ?? {};

  return {
    soundEnabled: settings.soundEnabled !== false,
    hapticsEnabled: settings.hapticsEnabled !== false,
    reducedMotion: settings.reducedMotion === true,
    graphicsQuality: isGraphicsQuality(settings.graphicsQuality)
      ? settings.graphicsQuality
      : DEFAULT_GAME_SETTINGS.graphicsQuality,
    handedness: settings.handedness === "left" ? "left" : "right",
    joystickSensitivity: clampNumber(
      settings.joystickSensitivity,
      0.65,
      1.6,
      DEFAULT_GAME_SETTINGS.joystickSensitivity
    ),
    textScale: clampNumber(settings.textScale, 0.9, 1.25, DEFAULT_GAME_SETTINGS.textScale),
  };
}

/**
 * Build a fresh, all-zero {@link GameProgress} for a game that has never
 * been played. Used as the storage-agnostic base for a new record; the
 * `./react` entry's {@link readGameProgress} calls this indirectly via
 * {@link normalizeGameProgress} when nothing is persisted yet.
 *
 * @param slug - The game this progress record belongs to.
 * @param mode - The initial `lastSelectedMode`. Defaults to {@link DEFAULT_SESSION_MODE}.
 * @param now - Clock override for `updatedAt`, for deterministic tests. Defaults to `new Date()`.
 * @returns A new `GameProgress` with every counter at zero.
 */
export function createEmptyProgress(
  slug: string,
  mode: SessionMode = DEFAULT_SESSION_MODE,
  now = new Date()
): GameProgress {
  return {
    slug,
    lastSelectedMode: normalizeSessionMode(mode),
    bestScore: 0,
    sessionsStarted: 0,
    sessionsCompleted: 0,
    sessionsFailed: 0,
    sessionsAbandoned: 0,
    totalPlayMs: 0,
    updatedAt: now.toISOString(),
    milestones: [],
  };
}

/**
 * Coerce arbitrary input -- a corrupted or older-shaped localStorage value,
 * `undefined`, a partial object -- into a fully valid {@link GameProgress}
 * for `slug`. Every counter is clamped to a non-negative integer, the mode
 * is normalized, and a malformed `lastResult` is dropped rather than kept
 * half-broken, so a corrupted read degrades to sane defaults instead of
 * throwing or propagating bad data.
 *
 * @param slug - The game this progress record belongs to. Always wins over
 *   any `slug` present in `value`.
 * @param value - Untrusted candidate progress, or `null`/`undefined`.
 * @returns A fully populated, valid `GameProgress` for `slug`.
 */
export function normalizeGameProgress(
  slug: string,
  value: Partial<GameProgress> | null | undefined
): GameProgress {
  const progress = value ?? {};
  const lastResult = normalizeGameResult(slug, progress.lastResult);

  return {
    slug,
    lastSelectedMode: normalizeSessionMode(progress.lastSelectedMode),
    bestScore: Math.max(0, Number(progress.bestScore) || 0),
    sessionsStarted: Math.max(0, Math.floor(Number(progress.sessionsStarted) || 0)),
    sessionsCompleted: Math.max(0, Math.floor(Number(progress.sessionsCompleted) || 0)),
    sessionsFailed: Math.max(0, Math.floor(Number(progress.sessionsFailed) || 0)),
    sessionsAbandoned: Math.max(0, Math.floor(Number(progress.sessionsAbandoned) || 0)),
    totalPlayMs: Math.max(0, Math.floor(Number(progress.totalPlayMs) || 0)),
    updatedAt:
      typeof progress.updatedAt === "string" ? progress.updatedAt : new Date().toISOString(),
    milestones: Array.isArray(progress.milestones)
      ? progress.milestones.filter(
          (milestone): milestone is string => typeof milestone === "string"
        )
      : [],
    ...(lastResult ? { lastResult } : {}),
  };
}

/**
 * Return a copy of `progress` with `sessionsStarted` incremented, `lastSelectedMode`
 * updated to `mode`, and `updatedAt` bumped. Call this when a run begins; the
 * `./react` entry's {@link beginGameRun} calls it internally.
 *
 * @param progress - The progress record to update. Not mutated.
 * @param mode - The session mode the new run is starting in.
 * @param now - Clock override for `updatedAt`, for deterministic tests. Defaults to `new Date()`.
 * @returns A new `GameProgress` with the started-run counters applied.
 */
export function markProgressStarted(
  progress: GameProgress,
  mode: SessionMode,
  now = new Date()
): GameProgress {
  return {
    ...progress,
    lastSelectedMode: normalizeSessionMode(mode),
    sessionsStarted: progress.sessionsStarted + 1,
    updatedAt: now.toISOString(),
  };
}

/**
 * Fold a finished {@link GameResult} into `progress`: bumps the matching
 * status counter (`sessionsCompleted`/`sessionsFailed`/`sessionsAbandoned`),
 * raises `bestScore` if beaten, adds `result.durationMs` to `totalPlayMs`,
 * stores `result` as `lastResult`, unions in any newly-earned `milestones`,
 * and sets `updatedAt` to `result.endedAt`. Call this when a run ends; the
 * `./react` entry's {@link finishGameRun} calls it internally.
 *
 * @param progress - The progress record to update. Not mutated.
 * @param result - The finished run's result.
 * @param milestones - Milestone identifiers earned by this run, merged into
 *   `progress.milestones` (deduplicated, existing milestones preserved).
 * @returns A new `GameProgress` with the result folded in.
 */
export function recordGameResult(
  progress: GameProgress,
  result: GameResult,
  milestones: readonly string[] = []
): GameProgress {
  const nextMilestones = new Set(progress.milestones);
  for (const milestone of milestones) {
    nextMilestones.add(milestone);
  }

  return {
    ...progress,
    lastSelectedMode: normalizeSessionMode(result.mode),
    bestScore: Math.max(progress.bestScore, Math.max(0, result.score)),
    sessionsCompleted:
      result.status === "completed" ? progress.sessionsCompleted + 1 : progress.sessionsCompleted,
    sessionsFailed:
      result.status === "failed" ? progress.sessionsFailed + 1 : progress.sessionsFailed,
    sessionsAbandoned:
      result.status === "abandoned" ? progress.sessionsAbandoned + 1 : progress.sessionsAbandoned,
    totalPlayMs: progress.totalPlayMs + Math.max(0, result.durationMs),
    lastResult: result,
    updatedAt: result.endedAt,
    milestones: Array.from(nextMilestones),
  };
}

/**
 * Build a {@link GameResult} from raw run data. Normalizes the mode, clamps
 * the score to a non-negative integer, converts `startedAt`/`endedAt` (accepting
 * either a `Date` or an ISO string, tolerating an unparsable value by falling
 * back to the Unix epoch rather than throwing) to ISO strings, computes
 * `durationMs` from the two, and fills in a status-appropriate default
 * `summary` when none is given.
 *
 * @param input.slug - The game this result belongs to.
 * @param input.mode - The session mode the run was played in.
 * @param input.status - How the run ended. Never `"active"`.
 * @param input.score - The run's score; clamped to a non-negative integer.
 * @param input.startedAt - When the run started.
 * @param input.endedAt - When the run ended. Defaults to `new Date()` (now).
 * @param input.summary - Player-facing summary. Defaults to a status-based
 *   phrase ("Run complete" / "Run ended" / "Run abandoned").
 * @param input.stats - Optional free-form per-run stats.
 * @returns A fully populated `GameResult`.
 */
export function createGameResult(input: {
  slug: string;
  mode: SessionMode;
  status: Exclude<GameRunStatus, "active">;
  score: number;
  startedAt: string | Date;
  endedAt?: string | Date;
  summary?: string;
  stats?: Record<string, number | string | boolean>;
}): GameResult {
  const endedAt = toDate(input.endedAt ?? new Date());
  const startedAt = toDate(input.startedAt);

  return {
    slug: input.slug,
    mode: normalizeSessionMode(input.mode),
    status: input.status,
    score: Math.max(0, Math.floor(input.score || 0)),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(0, endedAt.getTime() - startedAt.getTime()),
    summary: input.summary ?? defaultResultSummary(input.status),
    ...(input.stats ? { stats: input.stats } : {}),
  };
}

/**
 * Build a new `status: "active"` {@link GameSaveSlot} marking a run as just
 * begun. The `./react` entry's {@link beginGameRun} calls this internally
 * and persists the result; call it directly only when managing storage yourself.
 *
 * @param input.slug - The game this save slot belongs to.
 * @param input.mode - The session mode the run is being played in.
 * @param input.label - Player-facing resume label. Defaults to `"Resume Run"`.
 * @param input.progressSummary - Short description of run progress. Defaults to `"Run started"`.
 * @param input.snapshot - Optional game-defined in-run state to persist.
 * @param input.now - Clock override for `startedAt`/`updatedAt`, for deterministic tests. Defaults to `new Date()`.
 * @returns A new active `GameSaveSlot`.
 */
export function createActiveSaveSlot(input: {
  slug: string;
  mode: SessionMode;
  label?: string;
  progressSummary?: string;
  snapshot?: SerializableValue;
  now?: Date;
}): GameSaveSlot {
  const now = input.now ?? new Date();

  return {
    slug: input.slug,
    mode: normalizeSessionMode(input.mode),
    status: "active",
    label: input.label ?? "Resume Run",
    startedAt: now.toISOString(),
    updatedAt: now.toISOString(),
    progressSummary: input.progressSummary ?? "Run started",
    ...(input.snapshot !== undefined ? { snapshot: input.snapshot } : {}),
  };
}

/**
 * Return a copy of `slot` with `patch` applied, the mode re-normalized, and
 * `updatedAt` bumped. Use this to record mid-run progress (a new checkpoint
 * summary, an updated snapshot) without recreating the whole slot. The
 * `./react` entry's {@link updateGameRun} calls this internally.
 *
 * @param slot - The save slot to update. Not mutated.
 * @param patch - Fields to overwrite. `mode`, if given, is normalized;
 *   otherwise `slot.mode` is kept.
 * @param now - Clock override for `updatedAt`, for deterministic tests. Defaults to `new Date()`.
 * @returns A new `GameSaveSlot` with the patch applied.
 */
export function updateActiveSaveSlot(
  slot: GameSaveSlot,
  patch: Partial<Pick<GameSaveSlot, "mode" | "label" | "progressSummary" | "snapshot">>,
  now = new Date()
): GameSaveSlot {
  return {
    ...slot,
    ...patch,
    mode: normalizeSessionMode(patch.mode ?? slot.mode),
    updatedAt: now.toISOString(),
  };
}

/**
 * Coerce arbitrary input into a valid {@link GameSaveSlot}, or `undefined`
 * if there is no in-progress run to resume. Unlike {@link normalizeGameProgress}
 * (which always returns a value), a save slot with no `status: "active"`
 * entry genuinely doesn't exist -- `undefined` here means "nothing to resume",
 * not "corrupted data".
 *
 * @param slug - The game this save slot belongs to. Always wins over any
 *   `slug` present in `value`.
 * @param value - Untrusted candidate slot, or `null`/`undefined`.
 * @returns A fully populated `GameSaveSlot`, or `undefined` if `value` is
 *   missing or not `status: "active"`.
 */
export function normalizeGameSaveSlot(
  slug: string,
  value: Partial<GameSaveSlot> | null | undefined
): GameSaveSlot | undefined {
  if (!value || value.status !== "active") return undefined;

  return {
    slug,
    mode: normalizeSessionMode(value.mode),
    status: "active",
    label: typeof value.label === "string" && value.label.length > 0 ? value.label : "Resume Run",
    startedAt: typeof value.startedAt === "string" ? value.startedAt : new Date().toISOString(),
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    progressSummary:
      typeof value.progressSummary === "string" && value.progressSummary.length > 0
        ? value.progressSummary
        : "Run in progress",
    ...(value.snapshot !== undefined ? { snapshot: value.snapshot as SerializableValue } : {}),
  };
}

function normalizeGameResult(
  slug: string,
  value: Partial<GameResult> | null | undefined
): GameResult | undefined {
  if (!value || !isFinishedStatus(value.status)) return undefined;
  const startedAt = toDate(value.startedAt ?? new Date());
  const endedAt = toDate(value.endedAt ?? startedAt);

  return {
    slug,
    mode: normalizeSessionMode(value.mode),
    status: value.status,
    score: Math.max(0, Math.floor(Number(value.score) || 0)),
    startedAt: startedAt.toISOString(),
    endedAt: endedAt.toISOString(),
    durationMs: Math.max(
      0,
      Math.floor(Number(value.durationMs) || endedAt.getTime() - startedAt.getTime())
    ),
    summary: typeof value.summary === "string" ? value.summary : defaultResultSummary(value.status),
    ...(value.stats ? { stats: value.stats as Record<string, number | string | boolean> } : {}),
  };
}

function isFinishedStatus(status: unknown): status is Exclude<GameRunStatus, "active"> {
  return status === "completed" || status === "failed" || status === "abandoned";
}

function isGraphicsQuality(value: unknown): value is GraphicsQuality {
  return value === "low" || value === "balanced" || value === "high";
}

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function toDate(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0) : date;
}

function defaultResultSummary(status: Exclude<GameRunStatus, "active">) {
  if (status === "completed") return "Run complete";
  if (status === "failed") return "Run ended";
  return "Run abandoned";
}

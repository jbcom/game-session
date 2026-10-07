import { useCallback, useEffect, useState } from "react";
import {
  createActiveSaveSlot,
  createEmptyProgress,
  createGameResult,
  type GameProgress,
  type GameResult,
  type GameRunStatus,
  type GameSaveSlot,
  type GameSettings,
  markProgressStarted,
  normalizeGameProgress,
  normalizeGameSaveSlot,
  normalizeGameSettings,
  recordGameResult,
  type SerializableValue,
  updateActiveSaveSlot,
} from "./runtime.js";
import { normalizeSessionMode, type SessionMode } from "./sessionMode.js";

/**
 * The default localStorage key prefix every read/write function in this
 * module uses unless a caller passes its own `namespace`. Every key this
 * package writes is `${namespace}:<kind>[:<slug>]`, so two apps on one
 * origin only collide if they share a namespace -- pass a different
 * `namespace` (e.g. your game's own slug) to keep them isolated.
 */
export const DEFAULT_STORAGE_NAMESPACE = "game-session:v1";

/** Input to {@link finishGameRun} / {@link useGameRuntime}'s `finishRun`, describing how a run ended. */
export interface FinishGameRunInput {
  /** The session mode the run was played in. */
  mode: SessionMode;
  /** How the run ended. Never `"active"`. */
  status: Exclude<GameRunStatus, "active">;
  /** The run's score. */
  score: number;
  /** Player-facing summary. Defaults to a status-based phrase when omitted. */
  summary?: string;
  /** Optional free-form per-run stats. */
  stats?: Record<string, number | string | boolean>;
  /** Milestone identifiers earned by this run. */
  milestones?: readonly string[];
  /** Clock override for `endedAt`, for deterministic tests. Defaults to `new Date()`. */
  now?: Date;
}

/** Input to {@link abandonGameRun} / {@link useGameRuntime}'s `abandonRun`, describing an in-progress run being quit. */
export interface AbandonGameRunInput {
  /** Overrides the mode recorded on the abandoned result. Defaults to the active save slot's mode. */
  mode?: SessionMode;
  /** The score at the point of abandonment. Defaults to `0`. */
  score?: number;
  /** Player-facing summary. Defaults to `"Run abandoned"` when omitted. */
  summary?: string;
  /** Optional free-form per-run stats. */
  stats?: Record<string, number | string | boolean>;
  /** Milestone identifiers earned before abandoning. */
  milestones?: readonly string[];
  /** Clock override for `endedAt`, for deterministic tests. Defaults to `new Date()`. */
  now?: Date;
}

/** Fields of a {@link GameSaveSlot} that {@link updateGameRun} / `useGameRuntime`'s `updateRun` may patch. */
export interface UpdateGameRunInput {
  /** New player-facing resume label. */
  label?: string;
  /** New session mode. */
  mode?: SessionMode;
  /** New short description of run progress. */
  progressSummary?: string;
  /** New game-defined in-run state snapshot. */
  snapshot?: SerializableValue;
}

function settingsKey(namespace: string) {
  return `${namespace}:settings`;
}

function progressKey(namespace: string, slug: string) {
  return `${namespace}:progress:${slug}`;
}

function saveKey(namespace: string, slug: string) {
  return `${namespace}:save:${slug}`;
}

/**
 * Read the player's cross-game settings from storage. A missing or corrupted
 * value degrades to {@link DEFAULT_GAME_SETTINGS} rather than throwing.
 *
 * @param storage - Storage backend to read from. Defaults to `window.localStorage`
 *   (or `undefined` outside a browser, in which case defaults are returned).
 * @param namespace - Key prefix. Defaults to {@link DEFAULT_STORAGE_NAMESPACE}.
 * @returns A fully populated `GameSettings`.
 */
export function readGameSettings(
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
): GameSettings {
  return normalizeGameSettings(readJson<GameSettings>(settingsKey(namespace), storage));
}

/**
 * Persist the player's cross-game settings, normalizing them first. A
 * storage failure (quota exceeded, storage disabled) is swallowed rather
 * than thrown.
 *
 * @param settings - The settings to normalize and persist.
 * @param storage - Storage backend to write to. Defaults to `window.localStorage`.
 * @param namespace - Key prefix. Defaults to {@link DEFAULT_STORAGE_NAMESPACE}.
 */
export function writeGameSettings(
  settings: GameSettings,
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
) {
  writeJson(settingsKey(namespace), normalizeGameSettings(settings), storage);
}

/**
 * Read one game's lifetime {@link GameProgress} from storage. A missing or
 * corrupted value degrades to {@link createEmptyProgress}'s shape rather
 * than throwing.
 *
 * @param slug - The game to read progress for.
 * @param storage - Storage backend to read from. Defaults to `window.localStorage`.
 * @param namespace - Key prefix. Defaults to {@link DEFAULT_STORAGE_NAMESPACE}.
 * @returns A fully populated `GameProgress`, always -- never `undefined`.
 */
export function readGameProgress(
  slug: string,
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
): GameProgress {
  return normalizeGameProgress(slug, readJson<GameProgress>(progressKey(namespace, slug), storage));
}

/**
 * Persist one game's {@link GameProgress}, normalizing it first. A storage
 * failure is swallowed rather than thrown.
 *
 * @param progress - The progress record to normalize and persist. Its `slug` selects the key.
 * @param storage - Storage backend to write to. Defaults to `window.localStorage`.
 * @param namespace - Key prefix. Defaults to {@link DEFAULT_STORAGE_NAMESPACE}.
 */
export function writeGameProgress(
  progress: GameProgress,
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
) {
  writeJson(
    progressKey(namespace, progress.slug),
    normalizeGameProgress(progress.slug, progress),
    storage
  );
}

/**
 * Read one game's in-progress {@link GameSaveSlot} from storage, if any.
 *
 * @param slug - The game to read the save slot for.
 * @param storage - Storage backend to read from. Defaults to `window.localStorage`.
 * @param namespace - Key prefix. Defaults to {@link DEFAULT_STORAGE_NAMESPACE}.
 * @returns The active save slot, or `undefined` if there is no run to resume.
 */
export function readGameSaveSlot(
  slug: string,
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
): GameSaveSlot | undefined {
  return normalizeGameSaveSlot(slug, readJson<GameSaveSlot>(saveKey(namespace, slug), storage));
}

/**
 * Persist one game's {@link GameSaveSlot}, normalizing it first. A storage
 * failure is swallowed rather than thrown.
 *
 * @param slot - The save slot to normalize and persist. Its `slug` selects the key.
 * @param storage - Storage backend to write to. Defaults to `window.localStorage`.
 * @param namespace - Key prefix. Defaults to {@link DEFAULT_STORAGE_NAMESPACE}.
 */
export function writeGameSaveSlot(
  slot: GameSaveSlot,
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
) {
  writeJson(saveKey(namespace, slot.slug), normalizeGameSaveSlot(slot.slug, slot), storage);
}

/**
 * Delete one game's in-progress save slot, e.g. after a run finishes or is
 * abandoned. A storage failure is swallowed rather than thrown. Safe to call
 * when no save slot exists.
 *
 * @param slug - The game to clear the save slot for.
 * @param storage - Storage backend to write to. Defaults to `window.localStorage`.
 * @param namespace - Key prefix. Defaults to {@link DEFAULT_STORAGE_NAMESPACE}.
 */
export function clearGameSaveSlot(
  slug: string,
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
) {
  try {
    storage?.removeItem(saveKey(namespace, slug));
  } catch {
    return;
  }
}

/**
 * Patch the currently-active save slot for `slug` (label, mode, progress
 * summary, or snapshot) and persist the result. A no-op returning `undefined`
 * if there is no active run for this game -- use {@link beginGameRun} to
 * start one first.
 *
 * @param slug - The game whose active run to patch.
 * @param patch - Fields to overwrite on the save slot.
 * @param storage - Storage backend to read/write. Defaults to `window.localStorage`.
 * @param namespace - Key prefix. Defaults to {@link DEFAULT_STORAGE_NAMESPACE}.
 * @returns The updated save slot, or `undefined` if there was no active run.
 */
export function updateGameRun(
  slug: string,
  patch: UpdateGameRunInput,
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
): GameSaveSlot | undefined {
  const slot = readGameSaveSlot(slug, storage, namespace);
  if (!slot) return undefined;

  const next = updateActiveSaveSlot(slot, patch);
  writeGameSaveSlot(next, storage, namespace);
  return next;
}

/**
 * Start a new run for `slug`: increments the game's `sessionsStarted`
 * counter and writes a fresh `status: "active"` save slot, persisting both.
 * This is the storage-backed counterpart to {@link markProgressStarted} +
 * {@link createActiveSaveSlot} together.
 *
 * @param slug - The game the run belongs to.
 * @param mode - The session mode to play in.
 * @param options.label - Resume-menu label. Defaults to `"Resume <Mode> Run"`.
 * @param options.progressSummary - Short progress description. Defaults to the mode's display name.
 * @param options.snapshot - Optional game-defined in-run state to persist.
 * @param storage - Storage backend to read/write. Defaults to `window.localStorage`.
 * @param namespace - Key prefix. Defaults to {@link DEFAULT_STORAGE_NAMESPACE}.
 * @returns The updated `progress` and the new active `slot`.
 */
export function beginGameRun(
  slug: string,
  mode: SessionMode,
  options: { label?: string; progressSummary?: string; snapshot?: SerializableValue } = {},
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
) {
  const normalizedMode = normalizeSessionMode(mode);
  const progress = markProgressStarted(readGameProgress(slug, storage, namespace), normalizedMode);
  const slot = createActiveSaveSlot({
    label: options.label ?? `Resume ${modeLabel(normalizedMode)} Run`,
    mode: normalizedMode,
    progressSummary: options.progressSummary ?? modeLabel(normalizedMode),
    slug,
    snapshot: options.snapshot,
  });

  writeGameProgress(progress, storage, namespace);
  writeGameSaveSlot(slot, storage, namespace);

  return { progress, slot };
}

/**
 * Finish the current run for `slug`: builds a {@link GameResult} from
 * `input` (using the active save slot's `startedAt`, if any, to compute
 * duration), folds it into the game's {@link GameProgress}, persists the
 * updated progress, and clears the resume slot. Works even with no active
 * save slot (the result's `startedAt` then falls back to `now`).
 *
 * @param slug - The game the run belongs to.
 * @param input - How the run ended.
 * @param storage - Storage backend to read/write. Defaults to `window.localStorage`.
 * @param namespace - Key prefix. Defaults to {@link DEFAULT_STORAGE_NAMESPACE}.
 * @returns The updated `progress` and the finished-run `result`.
 */
export function finishGameRun(
  slug: string,
  input: FinishGameRunInput,
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
): { progress: GameProgress; result: GameResult } {
  const saveSlot = readGameSaveSlot(slug, storage, namespace);
  const progress = readGameProgress(slug, storage, namespace);
  const now = input.now ?? new Date();
  const result = createGameResult({
    endedAt: now,
    mode: input.mode,
    score: input.score,
    slug,
    startedAt: saveSlot?.startedAt ?? now,
    status: input.status,
    summary: input.summary,
    stats: input.stats,
  });
  const nextProgress = recordGameResult(progress, result, input.milestones ?? []);

  writeGameProgress(nextProgress, storage, namespace);
  clearGameSaveSlot(slug, storage, namespace);

  return { progress: nextProgress, result };
}

/**
 * Quit the current run for `slug` as `status: "abandoned"` -- the pause
 * menu's "Quit Run" action. Equivalent to {@link finishGameRun} with
 * `status: "abandoned"`, except it's a no-op (returning `undefined`) when
 * there is no active run to abandon, rather than fabricating one.
 *
 * @param slug - The game the run belongs to.
 * @param input - Optional overrides for the abandoned result (mode, score, summary, stats, milestones, clock).
 * @param storage - Storage backend to read/write. Defaults to `window.localStorage`.
 * @param namespace - Key prefix. Defaults to {@link DEFAULT_STORAGE_NAMESPACE}.
 * @returns The updated `progress` and the abandoned-run `result`, or
 *   `undefined` if there was no active run.
 */
export function abandonGameRun(
  slug: string,
  input: AbandonGameRunInput = {},
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
): { progress: GameProgress; result: GameResult } | undefined {
  const saveSlot = readGameSaveSlot(slug, storage, namespace);
  if (!saveSlot) {
    clearGameSaveSlot(slug, storage, namespace);
    return undefined;
  }

  return finishGameRun(
    slug,
    {
      milestones: input.milestones,
      mode: input.mode ?? saveSlot.mode,
      now: input.now,
      score: input.score ?? 0,
      stats: input.stats,
      status: "abandoned",
      summary: input.summary,
    },
    storage,
    namespace
  );
}

export interface UseGameRuntimeOptions {
  /** localStorage key namespace. Defaults to {@link DEFAULT_STORAGE_NAMESPACE} (`"game-session:v1"`). */
  namespace?: string;
}

/**
 * React hook tying a game's persisted settings, progress, and active save
 * slot to component state, plus the full run lifecycle (`beginRun`,
 * `saveRun`, `updateRun`, `finishRun`, `abandonRun`, `clearRun`) already
 * bound to `slug`. Every mutator persists to storage and updates state in
 * the same call -- there is no separate "save" step.
 *
 * Settings load even when `slug` is omitted, so a top-level "settings only"
 * screen can use this hook without a game in context; `progress`/`saveSlot`
 * are `undefined` in that case, and `beginRun`/`updateRun`/`clearRun`/`finishRun`/`abandonRun`
 * become no-ops (returning `undefined`) until a slug is provided.
 *
 * Note: pause state is *not* part of this hook's state -- see the `./`
 * (root) entry's {@link setGameRuntimePaused}/{@link isGameRuntimePaused}
 * for the module-level pause flag, which a render loop can read without
 * subscribing to React state.
 *
 * @param slug - The game to load settings/progress/save-slot for. Omit for a
 *   settings-only usage with no game in context.
 * @param options.namespace - localStorage key prefix. Defaults to {@link DEFAULT_STORAGE_NAMESPACE}.
 * @returns `{ settings, progress, saveSlot }` plus `setSettings`, `setProgress`,
 *   `beginRun`, `saveRun`, `updateRun`, `clearRun`, `finishRun`, `abandonRun`.
 */
export function useGameRuntime(slug?: string, options: UseGameRuntimeOptions = {}) {
  const namespace = options.namespace ?? DEFAULT_STORAGE_NAMESPACE;

  const [settings, setSettingsState] = useState<GameSettings>(() =>
    readGameSettings(undefined, namespace)
  );
  const [progress, setProgressState] = useState<GameProgress | undefined>(() =>
    slug ? readGameProgress(slug, undefined, namespace) : undefined
  );
  const [saveSlot, setSaveSlotState] = useState<GameSaveSlot | undefined>(() =>
    slug ? readGameSaveSlot(slug, undefined, namespace) : undefined
  );

  useEffect(() => {
    setSettingsState(readGameSettings(undefined, namespace));
    setProgressState(slug ? readGameProgress(slug, undefined, namespace) : undefined);
    setSaveSlotState(slug ? readGameSaveSlot(slug, undefined, namespace) : undefined);
  }, [slug, namespace]);

  const setSettings = useCallback(
    (next: GameSettings | ((current: GameSettings) => GameSettings)) => {
      setSettingsState((current) => {
        const resolved = normalizeGameSettings(typeof next === "function" ? next(current) : next);
        writeGameSettings(resolved, undefined, namespace);
        applySettingsToDocument(resolved);
        return resolved;
      });
    },
    [namespace]
  );

  const setProgress = useCallback(
    (next: GameProgress | ((current: GameProgress) => GameProgress)) => {
      if (!slug) return;

      setProgressState((current) => {
        const resolved = normalizeGameProgress(
          slug,
          typeof next === "function" ? next(current ?? createEmptyProgress(slug)) : next
        );
        writeGameProgress(resolved, undefined, namespace);
        return resolved;
      });
    },
    [slug, namespace]
  );

  const beginRun = useCallback(
    (
      mode: SessionMode,
      options: { label?: string; progressSummary?: string; snapshot?: SerializableValue } = {}
    ) => {
      if (!slug) return undefined;
      const result = beginGameRun(slug, mode, options, undefined, namespace);
      setProgressState(result.progress);
      setSaveSlotState(result.slot);
      return result;
    },
    [slug, namespace]
  );

  const saveRun = useCallback(
    (slot: GameSaveSlot) => {
      writeGameSaveSlot(slot, undefined, namespace);
      setSaveSlotState(slot);
    },
    [namespace]
  );

  const updateRun = useCallback(
    (patch: UpdateGameRunInput) => {
      if (!slug) return undefined;
      const slot = updateGameRun(slug, patch, undefined, namespace);
      if (slot) setSaveSlotState(slot);
      return slot;
    },
    [slug, namespace]
  );

  const clearRun = useCallback(() => {
    if (!slug) return;
    clearGameSaveSlot(slug, undefined, namespace);
    setSaveSlotState(undefined);
  }, [slug, namespace]);

  const finishRun = useCallback(
    (input: FinishGameRunInput) => {
      if (!slug) return undefined;
      const result = finishGameRun(slug, input, undefined, namespace);
      setProgressState(result.progress);
      setSaveSlotState(undefined);
      return result;
    },
    [slug, namespace]
  );

  const abandonRun = useCallback(
    (input: AbandonGameRunInput = {}) => {
      if (!slug) return undefined;
      const result = abandonGameRun(slug, input, undefined, namespace);
      if (result) setProgressState(result.progress);
      setSaveSlotState(undefined);
      return result;
    },
    [slug, namespace]
  );

  return {
    abandonRun,
    beginRun,
    clearRun,
    finishRun,
    progress,
    saveRun,
    saveSlot,
    setProgress,
    setSettings,
    settings,
    updateRun,
  };
}

/**
 * Push a {@link GameSettings} record onto `document.documentElement` as
 * `data-*` attributes (`reducedMotion`, `graphicsQuality`, `handedness`) and
 * CSS custom properties (`--game-text-scale`, `--game-joystick-sensitivity`),
 * so plain CSS can react to settings without JS reading them at render time.
 * {@link useGameRuntime}'s `setSettings` calls this automatically; call it
 * directly only if you manage settings state yourself.
 *
 * A no-op outside a DOM environment (SSR, a worker) rather than throwing.
 *
 * @param settings - The settings to apply. Defaults to the currently persisted settings.
 */
export function applySettingsToDocument(settings: GameSettings = readGameSettings()) {
  if (typeof document === "undefined") return;

  const normalized = normalizeGameSettings(settings);
  document.documentElement.dataset.reducedMotion = String(normalized.reducedMotion);
  document.documentElement.dataset.graphicsQuality = normalized.graphicsQuality;
  document.documentElement.dataset.handedness = normalized.handedness;
  document.documentElement.style.setProperty("--game-text-scale", String(normalized.textScale));
  document.documentElement.style.setProperty(
    "--game-joystick-sensitivity",
    String(normalized.joystickSensitivity)
  );
}

function readJson<T>(key: string, storage: Storage | undefined): Partial<T> | undefined {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return undefined;
    return JSON.parse(raw) as Partial<T>;
  } catch {
    return undefined;
  }
}

function writeJson(key: string, value: unknown, storage: Storage | undefined) {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    return;
  }
}

function getStorage() {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

function modeLabel(mode: SessionMode) {
  return mode[0].toUpperCase() + mode.slice(1);
}

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
 * localStorage key prefix. Defaults to the arcade-cabinet shell's original
 * namespace for drop-in compatibility; override per-app to avoid collisions
 * when multiple session-runtime consumers share one origin.
 */
export const DEFAULT_STORAGE_NAMESPACE = "arcade-cabinet:v1";

export interface FinishGameRunInput {
  mode: SessionMode;
  status: Exclude<GameRunStatus, "active">;
  score: number;
  summary?: string;
  stats?: Record<string, number | string | boolean>;
  milestones?: readonly string[];
  now?: Date;
}

export interface AbandonGameRunInput {
  mode?: SessionMode;
  score?: number;
  summary?: string;
  stats?: Record<string, number | string | boolean>;
  milestones?: readonly string[];
  now?: Date;
}

export interface UpdateGameRunInput {
  label?: string;
  mode?: SessionMode;
  progressSummary?: string;
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

export function readCabinetSettings(
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
): GameSettings {
  return normalizeGameSettings(readJson<GameSettings>(settingsKey(namespace), storage));
}

export function writeCabinetSettings(
  settings: GameSettings,
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
) {
  writeJson(settingsKey(namespace), normalizeGameSettings(settings), storage);
}

export function readGameProgress(
  slug: string,
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
): GameProgress {
  return normalizeGameProgress(slug, readJson<GameProgress>(progressKey(namespace, slug), storage));
}

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

export function readGameSaveSlot(
  slug: string,
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
): GameSaveSlot | undefined {
  return normalizeGameSaveSlot(slug, readJson<GameSaveSlot>(saveKey(namespace, slug), storage));
}

export function writeGameSaveSlot(
  slot: GameSaveSlot,
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
) {
  writeJson(saveKey(namespace, slot.slug), normalizeGameSaveSlot(slot.slug, slot), storage);
}

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

export function beginGameRun(
  slug: string,
  mode: SessionMode,
  options: { label?: string; progressSummary?: string; snapshot?: SerializableValue } = {},
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
) {
  const normalizedMode = normalizeSessionMode(mode);
  const progress = markProgressStarted(
    readGameProgress(slug, storage, namespace) ?? createEmptyProgress(slug, normalizedMode),
    normalizedMode
  );
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

export function finishGameRun(
  slug: string,
  input: FinishGameRunInput,
  storage = getStorage(),
  namespace: string = DEFAULT_STORAGE_NAMESPACE
): { progress: GameProgress; result: GameResult } {
  const saveSlot = readGameSaveSlot(slug, storage, namespace);
  const progress =
    readGameProgress(slug, storage, namespace) ?? createEmptyProgress(slug, input.mode);
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

export interface UseCabinetRuntimeOptions {
  /** localStorage key namespace. Defaults to the shell's original "arcade-cabinet:v1". */
  namespace?: string;
}

export function useCabinetRuntime(slug?: string, options: UseCabinetRuntimeOptions = {}) {
  const namespace = options.namespace ?? DEFAULT_STORAGE_NAMESPACE;

  const [settings, setSettingsState] = useState<GameSettings>(() =>
    readCabinetSettings(undefined, namespace)
  );
  const [progress, setProgressState] = useState<GameProgress | undefined>(() =>
    slug ? readGameProgress(slug, undefined, namespace) : undefined
  );
  const [saveSlot, setSaveSlotState] = useState<GameSaveSlot | undefined>(() =>
    slug ? readGameSaveSlot(slug, undefined, namespace) : undefined
  );

  useEffect(() => {
    setSettingsState(readCabinetSettings(undefined, namespace));
    setProgressState(slug ? readGameProgress(slug, undefined, namespace) : undefined);
    setSaveSlotState(slug ? readGameSaveSlot(slug, undefined, namespace) : undefined);
  }, [slug, namespace]);

  const setSettings = useCallback(
    (next: GameSettings | ((current: GameSettings) => GameSettings)) => {
      setSettingsState((current) => {
        const resolved = normalizeGameSettings(typeof next === "function" ? next(current) : next);
        writeCabinetSettings(resolved, undefined, namespace);
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

export function applySettingsToDocument(settings: GameSettings = readCabinetSettings()) {
  if (typeof document === "undefined") return;

  const normalized = normalizeGameSettings(settings);
  document.documentElement.dataset.reducedMotion = String(normalized.reducedMotion);
  document.documentElement.dataset.graphicsQuality = normalized.graphicsQuality;
  document.documentElement.dataset.handedness = normalized.handedness;
  document.documentElement.style.setProperty("--cabinet-text-scale", String(normalized.textScale));
  document.documentElement.style.setProperty(
    "--cabinet-joystick-sensitivity",
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

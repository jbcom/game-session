import { DEFAULT_SESSION_MODE, normalizeSessionMode, type SessionMode } from "./sessionMode.js";

export type GameRunStatus = "active" | "completed" | "failed" | "abandoned";

export type GraphicsQuality = "low" | "balanced" | "high";

export type Handedness = "left" | "right";

export type SerializableValue =
  | string
  | number
  | boolean
  | null
  | SerializableValue[]
  | { [key: string]: SerializableValue };

export interface GameResult {
  slug: string;
  mode: SessionMode;
  status: Exclude<GameRunStatus, "active">;
  score: number;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  summary: string;
  stats?: Record<string, number | string | boolean>;
}

export interface GameProgress {
  slug: string;
  lastSelectedMode: SessionMode;
  bestScore: number;
  sessionsStarted: number;
  sessionsCompleted: number;
  sessionsFailed: number;
  sessionsAbandoned: number;
  totalPlayMs: number;
  lastResult?: GameResult;
  updatedAt: string;
  milestones: string[];
}

export interface GameSettings {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  reducedMotion: boolean;
  graphicsQuality: GraphicsQuality;
  handedness: Handedness;
  joystickSensitivity: number;
  textScale: number;
}

export interface GameSaveSlot {
  slug: string;
  mode: SessionMode;
  status: "active";
  label: string;
  startedAt: string;
  updatedAt: string;
  progressSummary: string;
  snapshot?: SerializableValue;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  soundEnabled: true,
  hapticsEnabled: true,
  reducedMotion: false,
  graphicsQuality: "balanced",
  handedness: "right",
  joystickSensitivity: 1,
  textScale: 1,
};

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

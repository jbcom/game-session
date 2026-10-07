---
title: API reference
description: Every export of game-session, by entry point.
---

Three entry points, each importable on its own:

| Entry point | Needs | Contents |
| --- | --- | --- |
| `game-session` | nothing | Session modes, run, progress, settings and save-slot shapes, the pause flag |
| `game-session/react` | `react` | `localStorage`-backed read and write functions, the run lifecycle, `useGameRuntime` |
| `game-session/ui` | `react`, `lucide-react`, Tailwind CSS | Pause menu, settings panel, menu button, error boundary, result recorder |

All dates are ISO 8601 strings in stored data. All functions that take a
`storage` argument default to `window.localStorage` (or `undefined` where there
is no `window`) and accept any object with `getItem`, `setItem` and `removeItem`.

## `game-session`

### Session modes

```ts
const SESSION_MODES: readonly ["cozy", "standard", "challenge"];
type SessionMode = "cozy" | "standard" | "challenge";
const DEFAULT_SESSION_MODE: SessionMode; // "standard"

function normalizeSessionMode(mode: string | null | undefined): SessionMode;
```

`normalizeSessionMode` returns `DEFAULT_SESSION_MODE` for anything that is not
exactly one of the three modes.

```ts
interface SessionTuning {
  mode: SessionMode;
  targetMinutes: readonly [number, number];
  minimumNoInputGraceMs: number;
  mistakeRecoveryCount: number;
  pressureScale: number;
  recoveryScale: number;
  description: string;
}

const DEFAULT_SESSION_TUNING: Record<SessionMode, SessionTuning>;

function getSessionTuning(
  mode: string | null | undefined,
  overrides?: Record<SessionMode, SessionTuning>
): SessionTuning;
function getSessionPressureScale(
  mode: string | null | undefined,
  values?: Record<SessionMode, number>
): number;
function getSessionRecoveryScale(
  mode: string | null | undefined,
  values?: Record<SessionMode, number>
): number;
```

The mode is normalized first. `overrides` and `values` replace the defaults for
the lookup; build them per game on top of `DEFAULT_SESSION_TUNING`.

```ts
interface DifficultyVariant { mode: SessionMode; label: string; description: string }
interface GameSessionCatalogFields {
  coreMessage: string;
  coreLoop: string;
  sessionTarget: string;
  pressureType: string;
  defaultControls: string;
  winReplayPromise: string;
  difficultyVariants: readonly DifficultyVariant[];
}
const DEFAULT_DIFFICULTY_VARIANTS: readonly DifficultyVariant[];
```

`GameSessionCatalogFields` is descriptive copy for a game-select screen. The
package never reads or stores it.

### Runs, results and progress

```ts
type GameRunStatus = "active" | "completed" | "failed" | "abandoned";

interface GameResult {
  slug: string;
  mode: SessionMode;
  status: Exclude<GameRunStatus, "active">;
  score: number;            // non-negative integer
  startedAt: string;
  endedAt: string;
  durationMs: number;
  summary: string;
  stats?: Record<string, number | string | boolean>;
}

interface GameProgress {
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
```

| Function | Behavior |
| --- | --- |
| `createGameResult(input)` | Builds a `GameResult`. Normalizes the mode, floors the score at zero, accepts `Date` or ISO strings (an unparsable date becomes the Unix epoch), derives `durationMs`, and fills a default `summary` (`"Run complete"`, `"Run ended"`, `"Run abandoned"`). |
| `createEmptyProgress(slug, mode?, now?)` | An all-zero `GameProgress` for a game never played. |
| `normalizeGameProgress(slug, value)` | Coerces untrusted input to a valid `GameProgress` for `slug`; counters become non-negative integers, a malformed `lastResult` is dropped. |
| `markProgressStarted(progress, mode, now?)` | Copy with `sessionsStarted` incremented and `lastSelectedMode` set. |
| `recordGameResult(progress, result, milestones?)` | Copy with the matching status counter bumped, `bestScore` raised if beaten, `totalPlayMs` extended, `lastResult` stored and `milestones` unioned. |

### Settings

```ts
type GraphicsQuality = "low" | "balanced" | "high";
type Handedness = "left" | "right";

interface GameSettings {
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  reducedMotion: boolean;
  graphicsQuality: GraphicsQuality;
  handedness: Handedness;
  joystickSensitivity: number; // clamped to [0.65, 1.6]
  textScale: number;           // clamped to [0.9, 1.25]
}

const DEFAULT_GAME_SETTINGS: GameSettings;
function normalizeGameSettings(value: Partial<GameSettings> | null | undefined): GameSettings;
```

### Save slots

```ts
type SerializableValue =
  | string | number | boolean | null | SerializableValue[] | { [key: string]: SerializableValue };

interface GameSaveSlot {
  slug: string;
  mode: SessionMode;
  status: "active";
  label: string;
  startedAt: string;
  updatedAt: string;
  progressSummary: string;
  snapshot?: SerializableValue;
}
```

| Function | Behavior |
| --- | --- |
| `createActiveSaveSlot({ slug, mode, label?, progressSummary?, snapshot?, now? })` | A new active slot. |
| `updateActiveSaveSlot(slot, patch, now?)` | Copy with `mode`, `label`, `progressSummary` or `snapshot` replaced and `updatedAt` bumped. |
| `normalizeGameSaveSlot(slug, value)` | A valid slot, or `undefined` when `value` is missing or not `status: "active"`. `undefined` means nothing to resume, not corrupted data. |

### Pause flag

```ts
function setGameRuntimePaused(paused: boolean): void;
function isGameRuntimePaused(): boolean;
function clearGameRuntimePaused(): void;
interface GamePauseChangeDetail { paused: boolean }
```

`setGameRuntimePaused` writes `data-game-paused` on `<html>` and dispatches a
`CustomEvent<GamePauseChangeDetail>` named `game-session:pause-change` on
`window`. Outside a DOM it does nothing and `isGameRuntimePaused` returns
`false`.

## `game-session/react`

```ts
const DEFAULT_STORAGE_NAMESPACE: string; // "game-session:v1"
```

Stored keys are `${namespace}:settings`, `${namespace}:progress:${slug}` and
`${namespace}:save:${slug}`.

| Function | Behavior |
| --- | --- |
| `readGameSettings(storage?, namespace?)` | Normalized settings; defaults when missing or corrupt. |
| `writeGameSettings(settings, storage?, namespace?)` | Normalizes and stores. Storage errors are swallowed. |
| `readGameProgress(slug, storage?, namespace?)` | Always a valid `GameProgress`. |
| `writeGameProgress(progress, storage?, namespace?)` | Normalizes and stores under `progress.slug`. |
| `readGameSaveSlot(slug, storage?, namespace?)` | The active slot, or `undefined`. |
| `writeGameSaveSlot(slot, storage?, namespace?)` | Normalizes and stores under `slot.slug`. |
| `clearGameSaveSlot(slug, storage?, namespace?)` | Removes the slot; safe when none exists. |
| `beginGameRun(slug, mode, options?, storage?, namespace?)` | Increments `sessionsStarted`, writes a fresh active slot, returns `{ progress, slot }`. |
| `updateGameRun(slug, patch, storage?, namespace?)` | Patches the active slot; `undefined` when there is no active run. |
| `finishGameRun(slug, input, storage?, namespace?)` | Builds the result (using the slot's `startedAt` if any), folds it into progress, clears the slot, returns `{ progress, result }`. |
| `abandonGameRun(slug, input?, storage?, namespace?)` | `finishGameRun` with `status: "abandoned"`; `undefined` (and a cleared slot) when there was no active run. |
| `applySettingsToDocument(settings?)` | Sets `data-reduced-motion`, `data-graphics-quality`, `data-handedness` and the `--game-text-scale` and `--game-joystick-sensitivity` custom properties on `<html>`. A no-op without a DOM. |

### `useGameRuntime(slug?, options?)`

```ts
function useGameRuntime(slug?: string, options?: { namespace?: string }): {
  settings: GameSettings;
  progress: GameProgress | undefined;
  saveSlot: GameSaveSlot | undefined;
  setSettings(next: GameSettings | ((current: GameSettings) => GameSettings)): void;
  setProgress(next: GameProgress | ((current: GameProgress) => GameProgress)): void;
  beginRun(mode: SessionMode, options?: { label?; progressSummary?; snapshot? }): { progress; slot } | undefined;
  saveRun(slot: GameSaveSlot): void;
  updateRun(patch: UpdateGameRunInput): GameSaveSlot | undefined;
  clearRun(): void;
  finishRun(input: FinishGameRunInput): { progress; result } | undefined;
  abandonRun(input?: AbandonGameRunInput): { progress; result } | undefined;
};
```

Settings load even without a `slug`; without one, `progress` and `saveSlot` are
`undefined` and the run mutators do nothing. Every mutator persists and updates
state in the same call. `setSettings` also calls `applySettingsToDocument`.

## `game-session/ui`

| Export | Props of note |
| --- | --- |
| `GameMenuButton` | `onClick`, `title?` (default `"Open game menu"`). Fixed top-left, marked `data-joystick-ignore`. |
| `GamePauseMenu` | `gameTitle`, `open`, `settings`, `rules?`, `saveSlot?`, `eyebrow?`, and the callbacks `onClose`, `onRestart`, `onQuitRun`, `onMainMenu`, `onSettingsChange`. Renders nothing when closed and resets to its main view when reopened. |
| `GameSettingsPanel` | `settings`, `onBack`, `onSettingsChange`. Usable on its own. |
| `GameErrorBoundary` | `boundaryKey?`, `onReturnToMenu?`. Catches render errors and shows a fallback; a changed `boundaryKey` clears the error. |
| `RuntimeResultRecorder` | `slug`, `mode`, `status`, `score`, `summary?`, `stats?`, `milestones?`, `namespace?`. Records one result per distinct set of props, then renders nothing. |

The components take their handlers as props and own no routing or persistence.

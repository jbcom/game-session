# game-session

[![CI](https://github.com/jbcom/game-session/actions/workflows/ci.yml/badge.svg)](https://github.com/jbcom/game-session/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/game-session.svg)](https://www.npmjs.com/package/game-session)
[![MIT license](https://img.shields.io/badge/license-MIT-17324d.svg)](./LICENSE)

Session modes, run and progress recording in `localStorage`, a module-level
pause flag, a React hook, and pause-menu and settings UI for browser games.

A game usually needs the same three things around its actual gameplay: a
difficulty posture the player picked, somewhere to keep their progress between
visits, and a pause menu that stops the world without losing it. This package is
those three things, split so you can take one without the others.

- **`game-session`**: pure logic. Session modes, run results, progress
  normalization, and a pause flag. No React, no DOM required.
- **`game-session/react`**: a `useGameRuntime` hook plus plain functions over
  `localStorage`.
- **`game-session/ui`**: a presentational pause menu, settings panel, and error
  boundary.

Full documentation: **[jbcom.github.io/game-session](https://jbcom.github.io/game-session/)**

## Install

```sh
npm install game-session
```

`react` and `lucide-react` are **optional** peer dependencies. You only need
them if you import the `/react` or `/ui` subpaths; the core entry point has no
runtime dependencies at all.

```sh
npm install game-session react lucide-react
```

## Compatibility

- Node.js 22, 24 and 26 are supported (`engines.node >=22`, CI covers each
  maintained line); the published
  output targets ES2022 browsers.
- React 19 for `/react` and `/ui`; `lucide-react` `>=0.400.0 <2` for `/ui`.
- Tailwind CSS in the app that renders `/ui`: the components are styled with
  utility classes and ship no stylesheet of their own.

The package ships native ESM and CommonJS entry points with format-correct
types for both.

## Session modes

Three postures, `cozy` / `standard` / `challenge`, each with tuning a game can
read instead of inventing its own difficulty constants.

```ts
import { getSessionPressureScale, getSessionTuning } from "game-session";

const tuning = getSessionTuning("cozy");
// tuning.targetMinutes        -> [10, 18]
// tuning.mistakeRecoveryCount -> 4, how many mistakes to forgive
// tuning.pressureScale        -> 0.62, multiply your hazard rate by this

spawnHazards(baseRate * getSessionPressureScale("challenge"));
```

`normalizeSessionMode` accepts anything (a URL param, a stale stored value,
`undefined`) and always returns a valid mode, so you never have to guard at the
call site. `DEFAULT_SESSION_TUNING` is a starting point, not a straitjacket:
games that need per-title tuning build their own
`Record<string, Record<SessionMode, SessionTuning>>` on top of it.

## Runs and progress

```ts
import { beginGameRun, finishGameRun, readGameProgress } from "game-session/react";

// Starts a run and writes the resume slot.
const { progress, slot } = beginGameRun("puzzle-quest", "standard");

// ...player plays...

const { result } = finishGameRun("puzzle-quest", {
  mode: "standard",
  status: "completed",
  score: 4200,
});

readGameProgress("puzzle-quest");
// -> { slug, bestScore, sessionsStarted, sessionsCompleted, totalPlayMs, ... }
```

`finishGameRun` folds the result into progress and clears the resume slot.
`abandonGameRun(slug)` is the same path with `status: "abandoned"`, and returns
`undefined` when there was no run in flight.

Everything is stored under a key prefix you control. The default,
`DEFAULT_STORAGE_NAMESPACE`, is `"game-session:v1"`, which every app on one
origin shares, so pass your own namespace to keep two apps from colliding.
Reads normalize whatever they find, so a corrupted or older-shaped value
degrades to defaults instead of throwing, and a storage failure (quota,
disabled storage, server rendering) is swallowed rather than thrown.

## Pausing

The pause flag is a module-level primitive with a DOM event behind it, so the
part of your game that pauses does not need a reference to the part that owns
the menu.

```ts
import { isGameRuntimePaused } from "game-session";

function frame(dt: number) {
  if (isGameRuntimePaused()) return;
  update(dt);
}
```

## React

`useGameRuntime(slug, options?)` keeps settings, progress, and the resume slot
in component state and gives you the run lifecycle already bound to that slug:
`beginRun`, `saveRun`, `updateRun`, `finishRun`, `abandonRun`, `clearRun`, plus
`setSettings` and `setProgress`.

```tsx
import { useState } from "react";
import { setGameRuntimePaused } from "game-session";
import { useGameRuntime } from "game-session/react";
import { GamePauseMenu } from "game-session/ui";

function Game({ onExit }: { onExit: () => void }) {
  const { settings, saveSlot, setSettings, abandonRun } = useGameRuntime("puzzle-quest");
  const [paused, setPaused] = useState(false);

  return (
    <>
      <GameCanvas />
      <GamePauseMenu
        gameTitle="Puzzle Quest"
        open={paused}
        rules={["Match three tiles.", "Clear the board before time runs out."]}
        saveSlot={saveSlot}
        settings={settings}
        onMainMenu={onExit}
        onClose={() => {
          setGameRuntimePaused(false);
          setPaused(false);
        }}
        onRestart={() => restartRun()}
        onQuitRun={() => abandonRun()}
        onSettingsChange={setSettings}
      />
    </>
  );
}
```

Pause state is deliberately *not* owned by the hook: `setGameRuntimePaused` is a
module-level flag so your render loop can read it without subscribing to React
state. The `/ui` components are presentational and take their handlers as
props; they own no routing and no persistence, so they drop into an existing
shell.

## API overview

| Export | Entry point | What it does |
| --- | --- | --- |
| `SESSION_MODES`, `SessionMode` | `.` | The three modes |
| `getSessionTuning`, `getSessionPressureScale`, `getSessionRecoveryScale` | `.` | Per-mode tuning |
| `normalizeSessionMode` | `.` | Coerce unknown input to a valid mode |
| `DEFAULT_SESSION_TUNING`, `DEFAULT_DIFFICULTY_VARIANTS` | `.` | Defaults to build on |
| `createGameResult`, `recordGameResult` | `.` | Build and fold in a run result |
| `createEmptyProgress`, `normalizeGameProgress`, `markProgressStarted` | `.` | Progress shaping |
| `normalizeGameSettings`, `DEFAULT_GAME_SETTINGS` | `.` | Settings shaping |
| `createActiveSaveSlot`, `updateActiveSaveSlot`, `normalizeGameSaveSlot` | `.` | Save slots |
| `setGameRuntimePaused`, `isGameRuntimePaused`, `clearGameRuntimePaused` | `.` | Pause flag |
| `useGameRuntime` | `./react` | The hook tying storage to component state |
| `beginGameRun`, `updateGameRun`, `finishGameRun`, `abandonGameRun` | `./react` | Run lifecycle |
| `readGameSettings`, `writeGameSettings` | `./react` | Settings persistence |
| `readGameProgress`, `writeGameProgress` | `./react` | Progress persistence |
| `readGameSaveSlot`, `writeGameSaveSlot`, `clearGameSaveSlot` | `./react` | Save-slot persistence |
| `applySettingsToDocument` | `./react` | Push settings onto the document |
| `GamePauseMenu`, `GameSettingsPanel`, `GameMenuButton` | `./ui` | Pause and settings UI |
| `RuntimeResultRecorder` | `./ui` | Records a result on mount |
| `GameErrorBoundary` | `./ui` | Error boundary with a return-to-menu fallback |

Every export is documented with TSDoc, and the signatures live in the
[API reference](./docs/API.md).

## Documentation

- [API reference](./docs/API.md): every export, its parameters and behavior.
- [Architecture](./docs/ARCHITECTURE.md): module boundaries, storage keys,
  invariants and intentional limits.
- [Migrating from the earlier names](./docs/MIGRATION.md): the rename mapping
  for code written against the `Cabinet*` API.
- [CONTRIBUTING.md](./CONTRIBUTING.md): local setup and the `pnpm verify` gate.

## License

MIT. See [LICENSE](./LICENSE).

# @jbcom/game-session

Session modes, pause-menu and settings UI, and local-storage-backed run and
progress recording for browser games.

A game usually needs the same three things around its actual gameplay: a
difficulty posture the player picked, somewhere to keep their progress between
visits, and a pause menu that stops the world without losing it. This package is
those three things, split so you can take one without the others.

- **`@jbcom/game-session`** — pure logic. Session modes, run results, progress
  normalization, and a pause flag. No React, no DOM required.
- **`@jbcom/game-session/react`** — a `useCabinetRuntime` hook plus plain
  functions over `localStorage`.
- **`@jbcom/game-session/ui`** — presentational pause menu, settings panel, and
  an error boundary.

MIT licensed. Ships ESM and CommonJS with types for both.

## Install

```sh
npm install @jbcom/game-session
```

`react` and `lucide-react` are **optional** peer dependencies — you only need
them if you import the `/react` or `/ui` subpaths. The core entry point has no
runtime dependencies at all.

```sh
npm install @jbcom/game-session react lucide-react
```

Requires Node 22+ to build; the published output targets ES2022 browsers.

## Session modes

Three postures, `cozy` / `standard` / `challenge`, each with tuning a game can
read instead of inventing its own difficulty constants.

```ts
import { getSessionTuning, getSessionPressureScale } from "@jbcom/game-session";

const tuning = getSessionTuning("cozy");
// tuning.targetMinutes        -> [10, 18]
// tuning.mistakeRecoveryCount -> 4, how many mistakes to forgive
// tuning.pressureScale        -> 0.62, multiply your hazard rate by this

spawnHazards(baseRate * getSessionPressureScale("challenge"));
```

`normalizeSessionMode` accepts anything (a URL param, a stale localStorage
value, `undefined`) and always returns a valid mode, so you never have to guard
at the call site.

`DEFAULT_SESSION_TUNING` is a starting point, not a straitjacket. Games that
need per-title tuning build their own
`Record<string, Record<SessionMode, SessionTuning>>` on top of it.

## Progress and runs

```ts
import { beginGameRun, finishGameRun, readGameProgress } from "@jbcom/game-session/react";

// Starts a run and writes the resume slot.
const { progress, slot } = beginGameRun("my-game", "standard");

// ...player plays...

const { result } = finishGameRun("my-game", { mode: "standard", status: "completed", score: 4200 });

readGameProgress("my-game");
// -> { slug, bestScore, sessionsStarted, sessionsCompleted, totalPlayMs, ... }
```

`finishGameRun` folds the result into progress and clears the resume slot.
`abandonGameRun(slug)` is the same path with `status: "abandoned"`, and returns
`undefined` when there was no run in flight.

Everything is namespaced under a storage prefix you control
(`DEFAULT_STORAGE_NAMESPACE` is `"arcade-cabinet:v1"`); pass your own to keep
two games on one origin from colliding. Reads normalize whatever they find, so
a corrupted or older-shaped value degrades to defaults instead of throwing.

## Pausing

The pause flag is a module-level primitive with a DOM event behind it, so the
part of your game that pauses does not need a reference to the part that owns
the menu.

```ts
import { setCabinetRuntimePaused, isCabinetRuntimePaused } from "@jbcom/game-session";

function frame(dt: number) {
  if (isCabinetRuntimePaused()) return;
  update(dt);
}
```

## React

`useCabinetRuntime(slug, options?)` keeps settings, progress, and the resume
slot in component state and gives you the run lifecycle already bound to that
slug: `beginRun`, `saveRun`, `updateRun`, `finishRun`, `abandonRun`, `clearRun`,
plus `setSettings` and `setProgress`.

```tsx
import { useCabinetRuntime } from "@jbcom/game-session/react";
import { CabinetPauseMenu } from "@jbcom/game-session/ui";
import { isCabinetRuntimePaused, setCabinetRuntimePaused } from "@jbcom/game-session";

function Game() {
  const { settings, saveSlot, setSettings, abandonRun } = useCabinetRuntime("my-game");
  const [paused, setPaused] = useState(false);

  return (
    <>
      <Canvas />
      <CabinetPauseMenu
        gameTitle="My Game"
        open={paused}
        rules={["Collect the orbs.", "Do not touch the walls."]}
        saveSlot={saveSlot}
        settings={settings}
        onClose={() => {
          setCabinetRuntimePaused(false);
          setPaused(false);
        }}
        onRestart={() => restart()}
        onQuitRun={() => abandonRun()}
        onSettingsChange={setSettings}
      />
    </>
  );
}
```

Pause state is deliberately *not* owned by the hook — `setCabinetRuntimePaused`
is a module-level flag so your render loop can read it without subscribing to
React state.

The `/ui` components are presentational and take their handlers as props — they
own no routing and no persistence, so they drop into an existing shell rather
than asking you to build around them.

## API

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
| `setCabinetRuntimePaused`, `isCabinetRuntimePaused`, `clearCabinetRuntimePaused` | `.` | Pause flag |
| `useCabinetRuntime` | `./react` | The hook tying storage to component state |
| `beginGameRun`, `updateGameRun`, `finishGameRun`, `abandonGameRun` | `./react` | Run lifecycle |
| `readCabinetSettings` / `writeCabinetSettings` | `./react` | Settings persistence |
| `readGameProgress` / `writeGameProgress` | `./react` | Progress persistence |
| `readGameSaveSlot` / `writeGameSaveSlot` / `clearGameSaveSlot` | `./react` | Save-slot persistence |
| `applySettingsToDocument` | `./react` | Push settings onto the document |
| `CabinetPauseMenu`, `CabinetSettingsPanel`, `CabinetMenuButton` | `./ui` | Pause and settings UI |
| `RuntimeResultRecorder` | `./ui` | Records a result on mount |
| `CabinetErrorBoundary` | `./ui` | Error boundary |

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md). The whole gate is one command:

```sh
pnpm verify   # lint, typecheck, test, build
```

## License

MIT — see [LICENSE](./LICENSE).

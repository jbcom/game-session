---
title: Architecture
description: Module boundaries, stored data, invariants and intentional limits of game-session.
---

## Layers

```text
game-session            runtime.ts, sessionMode.ts, runtimePause.ts   pure logic, no React
game-session/react      react.ts                                      storage functions + useGameRuntime
game-session/ui         ui.tsx                                        presentational components
```

Dependencies point one way: `ui` uses `react`, `react` uses the root. The root
entry imports nothing, which is why a game can take only the session modes and
progress shaping without installing React.

## Pure functions first

Every state transition is a pure function over plain data: `markProgressStarted`,
`recordGameResult`, `updateActiveSaveSlot` and their siblings return a new object
and take the clock as an optional argument, so tests are deterministic and a
game that owns its own storage can use them without the `react` entry.

The `react` entry composes those functions with `localStorage`. `beginGameRun`
is `markProgressStarted` + `createActiveSaveSlot` + two writes; `finishGameRun`
is `createGameResult` + `recordGameResult` + a write + clearing the slot. The
hook is a thin layer of component state over those same functions.

## Stored data

| Key | Value |
| --- | --- |
| `${namespace}:settings` | A `GameSettings`, shared by every game in the namespace |
| `${namespace}:progress:${slug}` | One `GameProgress` per game |
| `${namespace}:save:${slug}` | At most one active `GameSaveSlot` per game |

The default namespace is `game-session:v1`. The `:v1` is the storage format
version; a future incompatible format would use a new suffix rather than
migrate in place.

## Invariants

1. **Reads never throw and never trust.** Every value read from storage passes
   through a `normalize*` function. A corrupted, truncated or older-shaped value
   degrades to defaults; counters are clamped to non-negative integers; a
   malformed `lastResult` is dropped.
2. **Writes never throw.** Quota errors, disabled storage and server rendering
   are swallowed by `writeJson` and `clearGameSaveSlot`.
3. **A save slot exists only while a run is active.** `normalizeGameSaveSlot`
   returns `undefined` for anything that is not `status: "active"`, and finishing
   or abandoning a run clears the slot. A finished run is a `GameResult`.
4. **The `slug` argument wins.** A `slug` stored inside a value never overrides
   the slug the caller asked for, so a copied or renamed key cannot read another
   game's data.
5. **Pause state is not React state.** It is a document attribute plus a window
   event, so a render loop reads it every frame without subscribing and without
   re-rendering.
6. **Dedup by content.** `RuntimeResultRecorder` records a result once per
   distinct set of props, so a screen that re-renders for unrelated reasons does
   not record the same run twice.

## Intentional limits

- **Browser storage only.** Persistence is `localStorage` (or any object with
  `getItem`/`setItem`/`removeItem`). There is no server sync, no IndexedDB and no
  cross-tab locking; two tabs writing the same slug last-write-wins.
- **One active run per game.** A second `beginGameRun` for the same slug replaces
  the slot (and still counts as a started session).
- **No styling system.** The `ui` entry is styled with Tailwind utility classes
  and ships no CSS. Games with their own design language should build their own
  menu on the pure and `react` entries.
- **Settings are global to a namespace.** Per-game settings need a per-game
  namespace.

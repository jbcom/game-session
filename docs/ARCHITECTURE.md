---
title: Architecture
description: Module boundaries, stored data, invariants and intentional limits of game-session.
---

## Layers

```text
game-session            runtime.ts, sessionMode.ts, runtimePause.ts   pure logic, no React
game-session/react      react.ts                                      storage functions + useGameRuntime
game-session/surfaces   surfaceStack.ts, surfaces.tsx                 headless dialog, drawer, sheet
game-session/ui         ui.tsx                                        presentational components
```

Dependencies point one way: `ui` uses `react` and `surfaces`, `react` uses the
root, and `surfaces` uses only `react` and the pause flag. The root entry
imports nothing, which is why a game can take only the session modes and
progress shaping without installing React. `surfaces` is its own entry, and `ui`
re-exports it, because `ui` imports `lucide-react` at module scope: a host
without that peer cannot import `ui` at all, and the surfaces must still work
there.

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
7. **One stack owns every open surface.** Focus trapping, Escape, the back
   button and the pause signal live in `createSurfaceStack`, never in a
   component. Only the top surface acts on a key or a back press. Escape and
   back are consumed whenever any surface is open, even a non-dismissible one,
   so neither reaches a handler behind it. The stack is plain DOM and has no
   React dependency; the components only register with it.
8. **The surfaces render only what the host passes.** No text, icon or colour
   is built in, and every structural style reads a CSS custom property. A
   surface that closes is removed at once; the stack holds no animation state.

## Intentional limits

- **Browser storage only.** Persistence is `localStorage` (or any object with
  `getItem`/`setItem`/`removeItem`). There is no server sync, no IndexedDB and no
  cross-tab locking; two tabs writing the same slug last-write-wins.
- **One active run per game.** A second `beginGameRun` for the same slug replaces
  the slot (and still counts as a started session).
- **No styling system.** The menu components in `ui` are styled with Tailwind
  utility classes and ship no CSS. Games with their own design language build
  their own menu on the `surfaces` primitives, which have no look at all, or on
  the pure and `react` entries.
- **Surfaces render in place.** There is no portal, because `react-dom` is not a
  dependency. Stacking order comes from the stack (one z-index step per
  surface), not from the document, and a transformed ancestor re-bases
  `position: fixed`.
- **The page behind a surface is not made inert.** A surface may be rendered
  inside another's content, and `inert` on the lower one would disable the upper.
  Keyboard focus is trapped by the stack and `aria-modal` tells assistive
  technology; a host that needs the rest of the page unreachable by pointer
  relies on the backdrop covering it.
- **No exit animation and no positive `tabindex`.** A closing surface is removed
  at once, and tabbing treats every `tabindex` of zero or more as document order.
- **Browser history is not used.** Back means the back-button source passed to
  the stack, or the host calling `stack.dismiss()`.
- **Settings are global to a namespace.** Per-game settings need a per-game
  namespace.

## Async device preferences

`createPreferencesStore({ storage, key, defaults, parse })` loads a typed settings
record before consumers mount. `storage` supplies asynchronous string `get` and
`set` methods, including the existing `persistence-save` Preferences KV adapter.
The package imports no storage backend, React, DOM, renderer or game schema.

The caller's `parse(unknown)` validates, clones and freezes its own settings,
throwing on invalid input. The same parser checks defaults, stored JSON and
updates. Failed or corrupt reads retain defaults without writing over storage.
`snapshot()` returns a stable `{ value, persistence }` object and `subscribe()`
supports external-store consumers. `set(unknown)` validates before changing
memory; invalid updates return false and change nothing. Accepted updates are
immediate and persist in order. Writes are read back before reporting `saved`;
`failed` retains the accepted in-memory choice and permits a later edit to retry.
`flush()` waits for writes queued before its call and returns the last queued
write's success; later edits need a later flush. A failed
observer cannot prevent persistence or notification of other observers. These
statuses describe storage, not whether a game's input or renderer applied a value.

This additive API leaves the existing synchronous settings and run APIs intact.
Do not store farm/world snapshots in preferences or persist temporary QA overrides.

---
title: Getting started
description: Install game-session and record your first run.
---

## Install

```sh
npm install game-session
# only for the /react and /ui entry points:
npm install react lucide-react
```

## Record a run without React

The pure entry and the storage functions work in any script. Any object with
`getItem`, `setItem` and `removeItem` is valid storage, so tests and server code
can pass an in-memory one.

```ts
import { normalizeSessionMode } from "game-session";
import { beginGameRun, finishGameRun, readGameProgress } from "game-session/react";

const mode = normalizeSessionMode(new URLSearchParams(location.search).get("mode"));

beginGameRun("puzzle-quest", mode, { progressSummary: "Level 1" });
// ...play...
finishGameRun("puzzle-quest", { mode, status: "completed", score: 1200 });

console.log(readGameProgress("puzzle-quest").bestScore);
```

## Choose a storage namespace

Keys are written under a prefix. The default, `game-session:v1`, is shared by
every app on one origin, so give your app its own:

```ts
beginGameRun("puzzle-quest", mode, {}, undefined, "my-app:v1");
```

`useGameRuntime("puzzle-quest", { namespace: "my-app:v1" })` takes the same
option. Use one namespace consistently: data stored under a different one is
simply not found.

## Pause the world

```ts
import { isGameRuntimePaused, setGameRuntimePaused } from "game-session";

function frame(dt: number) {
  if (isGameRuntimePaused()) return;
  update(dt);
}

setGameRuntimePaused(true); // from your menu button
```

Listen for changes with the `game-session:pause-change` window event, whose
`detail` is `{ paused: boolean }`.

## Add the menu

`GamePauseMenu` and `GameSettingsPanel` are presentational. Wire their handlers
to `useGameRuntime`; see the example in the
[README](https://github.com/jbcom/game-session#react). The components are styled
with Tailwind utility classes, so the host app needs Tailwind configured to scan
`node_modules/game-session/dist`.

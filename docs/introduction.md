---
title: game-session
description: Session modes, run and progress recording, a pause flag, a React hook and pause-menu UI for browser games.
---

game-session is the small layer a browser game needs around its gameplay: a
difficulty posture the player picked, somewhere to keep progress between visits,
and a pause menu that stops the world without losing it.

It is split into three entry points so a game can take one without the others:

| Entry point | Contents | Dependencies |
| --- | --- | --- |
| `game-session` | Session modes, run results, progress and save-slot shaping, the pause flag | none |
| `game-session/react` | `localStorage` functions and the `useGameRuntime` hook | `react` |
| `game-session/ui` | Pause menu, settings panel, error boundary | `react`, `lucide-react`, Tailwind CSS |

## Why use it?

| Problem | game-session convention |
| --- | --- |
| Every game invents its own easy/normal/hard constants | Three session modes with shared tuning to read |
| Progress in `localStorage` breaks when the shape changes | Every read is normalized; corrupt data degrades to defaults |
| A render loop needs to know the game is paused | A module-level flag plus a window event, no React subscription |
| "Continue" needs somewhere to keep a half-finished run | One active save slot per game, cleared when the run ends |
| Recording a result twice on a re-render | A recorder that dedupes by content |

Start with [Getting started](./getting-started/), then use the
[API reference](./API/) and the [architecture notes](./ARCHITECTURE/).

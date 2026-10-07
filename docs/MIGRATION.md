---
title: Migrating from the earlier names
description: The rename mapping for code written against the first, Cabinet-prefixed API.
---

Before its first npm release the package used a `Cabinet` prefix for its React,
pause and UI exports. Those names described one particular host app rather than
what the exports do, so they were renamed to neutral ones before `0.1.0`. Only
names, one prop, a few strings and the DOM hooks changed; behavior is identical.

If you used the earlier API from a git checkout or a private registry, update
imports from the old package name to `game-session` and apply the mapping below.

## Exports

| Earlier name | Name now | Entry point |
| --- | --- | --- |
| `useCabinetRuntime` | `useGameRuntime` | `game-session/react` |
| `UseCabinetRuntimeOptions` | `UseGameRuntimeOptions` | `game-session/react` |
| `readCabinetSettings` | `readGameSettings` | `game-session/react` |
| `writeCabinetSettings` | `writeGameSettings` | `game-session/react` |
| `setCabinetRuntimePaused` | `setGameRuntimePaused` | `game-session` |
| `isCabinetRuntimePaused` | `isGameRuntimePaused` | `game-session` |
| `clearCabinetRuntimePaused` | `clearGameRuntimePaused` | `game-session` |
| `CabinetPauseChangeDetail` | `GamePauseChangeDetail` | `game-session` |
| `CabinetMenuButton`, `CabinetMenuButtonProps` | `GameMenuButton`, `GameMenuButtonProps` | `game-session/ui` |
| `CabinetPauseMenu`, `CabinetPauseMenuProps` | `GamePauseMenu`, `GamePauseMenuProps` | `game-session/ui` |
| `CabinetSettingsPanel`, `CabinetSettingsPanelProps` | `GameSettingsPanel`, `GameSettingsPanelProps` | `game-session/ui` |
| `CabinetErrorBoundary`, `CabinetErrorBoundaryProps` | `GameErrorBoundary`, `GameErrorBoundaryProps` | `game-session/ui` |

Everything else (`beginGameRun`, `finishGameRun`, `GameSettings`,
`RuntimeResultRecorder`, `SessionMode`, ...) kept its name.

## Props

| Component | Earlier prop | Prop now |
| --- | --- | --- |
| `GamePauseMenu` | `onCabinet` | `onMainMenu` |
| `GameErrorBoundary` | `onReturnToCabinet` | `onReturnToMenu` |
| `GamePauseMenu` | (a fixed header line naming the host app) | optional `eyebrow` string, rendered above the title only when given |

## Visible text

| Where | Earlier text | Text now |
| --- | --- | --- |
| Pause menu action | `Cabinet` | `Main Menu` |
| Error boundary heading and button | `Return To Cabinet` | `Return To Menu` |
| Error boundary body | "This cartridge failed to start cleanly..." | "This game failed to start cleanly..." |
| Menu button default title | `Open cabinet menu` | `Open game menu` |

## DOM hooks

| Hook | Earlier | Now |
| --- | --- | --- |
| Pause attribute on `<html>` | `data-cabinet-paused` (`dataset.cabinetPaused`) | `data-game-paused` (`dataset.gamePaused`) |
| Text-scale custom property | `--cabinet-text-scale` | `--game-text-scale` |
| Joystick custom property | `--cabinet-joystick-sensitivity` | `--game-joystick-sensitivity` |
| Menu button test id | `cabinet-menu-button` | `game-menu-button` |
| Pause menu test id | `cabinet-pause-menu` | `game-pause-menu` |
| Settings panel test id | `cabinet-settings-panel` | `game-settings-panel` |
| Rules panel test id | `cabinet-rules-panel` | `game-rules-panel` |

## Unchanged on purpose

The default storage namespace `game-session:v1` and the window event
`game-session:pause-change` are neutral and stay as they are, so progress already
stored under the default namespace keeps loading.

Stored data written under an app-specific namespace is untouched: pass the same
`namespace` you used before.

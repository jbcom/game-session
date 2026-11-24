---
title: API reference
description: Every export of game-session, by entry point.
---

Four entry points, each importable on its own:

| Entry point | Needs | Contents |
| --- | --- | --- |
| `game-session` | nothing | Session modes, run, progress, settings and save-slot shapes, the pause flag |
| `game-session/react` | `react` | `localStorage`-backed read and write functions, the run lifecycle, `useGameRuntime` |
| `game-session/surfaces` | `react` | Unstyled dialog, drawer and sheet primitives and the surface stack behind them |
| `game-session/ui` | `react`, `lucide-react`, Tailwind CSS | Pause menu, settings panel, menu button, error boundary, result recorder, and everything `game-session/surfaces` exports |

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

`game-session/ui` also re-exports every name in the next section, so a host that
already imports it needs no second import. A host without `lucide-react` or
Tailwind imports them from `game-session/surfaces` instead: that entry needs
only `react`.

## `game-session/surfaces`

Unstyled, accessible layers that cover the page: a centred dialog, an edge
drawer, an edge sheet, and a full-frame surface. They render only what the host
passes in (no default text, icon or colour) and share one stack that owns focus,
Escape, the back button and the pause signal.

### Components

```tsx
function Dialog(props: SurfaceBaseProps): JSX.Element | null; // no placement: always centred
function Drawer(props: DrawerProps): JSX.Element | null;   // side?: "left" | "right" (default "right")
function Sheet(props: SheetProps): JSX.Element | null;     // side?: "bottom" | "top" | "left" | "right" (default "bottom")
function Surface(props: SurfaceProps): JSX.Element | null; // placement: SurfacePlacement
function SurfaceClose(props: SurfaceCloseProps): JSX.Element;

type SurfacePlacement = "center" | "left" | "right" | "top" | "bottom" | "fill";
```

`Dialog` is `Surface` with `placement="center"`. `Drawer` takes `side` `"left"`
or `"right"` (default `"right"`); `Sheet` takes `"bottom"`, `"top"`, `"left"` or
`"right"` (default `"bottom"`). Apart from the sides they accept and the default,
the two behave alike; use whichever names the role. A surface whose placement
changes with the viewport (a bottom sheet on a phone, a side panel on a wide
window) just passes a different `side` or `placement`.

| Prop | Type | Meaning |
| --- | --- | --- |
| `open` | `boolean` | Shown or not. Closed renders nothing and holds no focus. |
| `aria-label` or `aria-labelledby` | `string` | Required, one of the two. Names the surface for assistive technology. |
| `onDismiss` | `(reason: SurfaceDismissReason) => void` | Asked to close. The host sets `open` to `false`. Omit it for a surface that cannot be dismissed. |
| `pauses` | `boolean` | Whether this surface counts toward the pause signal. Default `true`. |
| `role` | `"dialog" \| "alertdialog"` | Default `"dialog"`. |
| `initialFocus` | ref or `() => HTMLElement \| null` | What takes focus on open. Default: a `[data-autofocus]` descendant, then the first tabbable, then the panel. |
| `returnFocus` | ref or `() => HTMLElement \| null` | Where focus goes on close. Default: what held focus when the surface opened. |
| `stack` | `SurfaceStack` | The stack to join. Default: the provider's, else the shared default. |
| `className`, `style`, `backdropClassName`, `backdropStyle`, any `div` attribute | | Pass-through. `style` and `backdropStyle` win over the structural layout. |

`SurfaceDismissReason` is `"escape" | "back" | "backdrop" | "close"`.
`backdrop` means a press that started and ended on the backdrop; a drag from the
panel onto it, a drag from it onto the panel and a cancelled touch do not count. The host may ignore any reason, for example to
close on Escape but not on a backdrop press.

`SurfaceClose` is a `<button type="button">` that calls `onDismiss("close")` on
the surface around it, unless its own `onClick` calls `preventDefault`. It does
nothing outside a surface and renders only the children the host passes.

### What a surface renders

```html
<div data-surface-backdrop data-placement="center">  <!-- fixed, full frame -->
  <div role="dialog" aria-modal="true" tabindex="-1"
       data-surface="dialog" data-placement="center"> <!-- the panel -->
    ...host content...
  </div>
</div>
```

`data-surface` is `dialog`, `drawer`, `sheet` or `surface`. Hosts style through
these attributes or `className`. The only styles set are structural, and each
reads a custom property the host can set on any ancestor:

| Property | Default | Use |
| --- | --- | --- |
| `--surface-z` | `1000` | The base `z-index` of a backdrop. Each surface sits one step above the one beneath it in the stack, so the surface that has keyboard focus is the one painted on top whatever the document order. |
| `--surface-inset-top`, `-right`, `-bottom`, `-left` | `env(safe-area-inset-*, 0px)` | Padding of the backdrop, so a panel stays clear of a notch or home indicator. |
| `--surface-target` | `48px` | Minimum width and height of `SurfaceClose`. A host raises it (for example to `64px`) to enlarge every target it builds on the same property. |

Nothing animates by default and no timing is read, so reduced motion is the
host's CSS: it gives the panel an entrance animation, and removes it under its
own reduced-motion setting or `prefers-reduced-motion`. A surface that closes is
removed at once, so there is no exit animation to wait for.

A touch is judged by where it ends, not by the element that captured it, so a
drag that starts on the backdrop and ends over the panel is not a backdrop
press.

A surface may be rendered inside another's content. A transformed ancestor makes
`position: fixed` relative to that ancestor, so when the lower surface animates
with a transform, render nested surfaces beside it instead.

### Behaviour

- **Focus.** On open, focus moves into the surface: `initialFocus`, else a
  `[data-autofocus]` descendant, else a descendant that already took focus (a
  child with `autoFocus`), else the first tabbable, else the panel. Tab and
  Shift+Tab wrap inside the top surface; focus moved outside it by a script
  returns to it. A radio group counts as one stop. Positive `tabindex` values,
  closed shadow roots and iframes are not handled (a key pressed inside an
  iframe is delivered to the iframe's own document, which the stack does not
  listen to). A disabled or hidden candidate is skipped for the next. The panel gets
  `tabindex="-1"` from the stack after mount if it has none.
- **Escape.** Intercepted in the capture phase on `window` while a surface is
  open. `stopImmediatePropagation` runs, so the key reaches no listener
  registered after the stack's (anything in the bubble phase, on `document` or
  below, or registered on `window` later), and a game's "Escape pauses" handler
  fires only when no surface is open. A listener registered earlier on `window`
  in the capture phase, or on `keyup`, still sees it. The top surface's
  `onDismiss("escape")` is called, except for a held key's repeats (one press
  closes one surface) and for an Escape that ends an IME composition
  (`isComposing`, or the `keyCode` 229 Safari sends), which belongs to the input
  method. A surface with no `onDismiss` consumes Escape too. A widget inside a
  surface, such as a combobox, therefore never sees Escape: close it from
  `onDismiss`.
- **Back.** See `SurfaceStackOptions.back`. While a surface is open, a back
  press closes the top surface and is always consumed.
- **Focus return.** On close, focus goes to the opener: `returnFocus` if given,
  else the element focused at the moment of opening (captured during render, so
  a child with `autoFocus` cannot replace it). If that is gone or inert, focus
  goes to the opener of any surface that was closed from beneath this one (a
  parent unmounts before its nested child), then to the surface beneath, else
  it is left alone. Closing by unmounting returns focus the same way.
- **Pointer lock** is released when the first surface opens, unless the stack
  is created with `releasePointerLock: false`. Held pointers and movement are
  the host's: map the pause signal to clear them.
- **Nesting.** Only the top surface traps focus and takes Escape and back, so
  Escape closes a detail sheet before the surface beneath it.
- **React StrictMode.** Registration is idempotent, and the pause signal
  coalesces a close-and-reopen in one task into no event.

### The stack

```ts
function createSurfaceStack(options?: SurfaceStackOptions): SurfaceStack;

interface SurfaceStackOptions {
  document?: Document;               // default: the global document; none means every call is a no-op
  back?: SurfaceBackSource;          // a back-button source
  releasePointerLock?: boolean;      // default true
}

interface SurfaceBackSource {
  pushBackHandler(handler: () => boolean): () => void;
}

interface SurfaceStack {
  register(registration: SurfaceRegistration): SurfaceHandle;
  captureOpener(): HTMLElement | null;
  dismiss(reason?: SurfaceDismissReason): boolean;  // default "back"
  getSnapshot(): SurfaceSnapshot;
  subscribe(listener: () => void): () => void;
  onPausingChange(listener: (pausing: boolean) => void): () => void;
  dispose(): void;
}

interface SurfaceSnapshot {
  readonly depth: number;     // surfaces open
  readonly pausing: boolean;  // any open surface has pauses set
}
```

`SurfaceBackSource` is satisfied by the `AppLifecycle` that
`capacitor-device-profile`'s `createAppLifecycle` returns, so
`createSurfaceStack({ back: lifecycle })` wires the Android back button with no
import of that package. While at least one surface is open, one handler is on
the source's stack; it closes the top surface and returns `true`. Where there
is no such source, call `stack.dismiss()` from your own back handling; it
returns `false` when no surface is open, so the press is yours.

`register` is the framework-free way to use the stack from any UI: it takes
`{ container, pauses?, onDismiss?, opener?, returnFocus?, initialFocus? }` and
returns `{ update({ pauses, onDismiss }), release(), getLayer() }` (`update` sets
both, it does not merge; `getLayer` is the surface's place in the stack, 0 for
the bottom, -1 once released). A surface whose container holds one already open
is placed beneath it, so nesting in the DOM decides order whichever registers
first. A `register` that throws (an `initialFocus` that throws) is rolled back
whole. The React components are a thin layer over it.

**The pause signal.** `getSnapshot().pausing` and `onPausingChange` report
whether a pausing surface is open, for the host to map to its own pause reason:

```ts
const stack = createSurfaceStack({ back: lifecycle });
stack.onPausingChange((pausing) => setPauseReason("surface", pausing));
```

`onPausingChange` fires once when the first pausing surface opens and once when
the last closes (nested surfaces add nothing), is delivered in a microtask, and
is not called with the current value on subscribe: read `getSnapshot()` for that.

```ts
function bindSurfacePauseFlag(stack: SurfaceStack): () => void;
```

Opt-in: mirrors the signal onto `setGameRuntimePaused`. If a pausing surface is
already open when it is called the flag is set at once; if none is, the flag is
left as it is, and afterwards it writes only the changes it makes itself, in step
with the stack (not coalesced), so a surface that opens and closes in one task
leaves the flag as it was. A host with its own pause model does not call it.

`dispose()` tells a host that heard a pausing surface open that none is open
now (`onPausingChange(false)`), then forgets every subscriber.

### React hooks and provider

```tsx
function SurfaceStackProvider(props: { stack: SurfaceStack; children?: ReactNode }): JSX.Element;
function useSurfaceStack(): SurfaceStack;            // the provider's, else the shared default
function useSurfaceSnapshot(stack?: SurfaceStack): SurfaceSnapshot;
function getDefaultSurfaceStack(): SurfaceStack;     // created on first use
```

Without a provider every surface joins the shared default stack, which is enough
for a game with one document. Create your own with `createSurfaceStack` to pass
a back source or to read the signal outside React. `useSurfaceSnapshot`
re-renders on any change and returns an empty snapshot on the server.

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

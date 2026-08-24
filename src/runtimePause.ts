const PAUSE_EVENT = "game-session:pause-change";

/** Payload dispatched on the `"game-session:pause-change"` window event. */
export interface CabinetPauseChangeDetail {
  /** The new pause state, matching what {@link isCabinetRuntimePaused} now returns. */
  paused: boolean;
}

/**
 * Set the module-level pause flag. Writes `document.documentElement.dataset.cabinetPaused`
 * and fires a `"game-session:pause-change"` `CustomEvent<CabinetPauseChangeDetail>`
 * on `window`, so the part of a game that pauses (the render/update loop) never
 * needs a direct reference to the part that owns the pause menu -- both sides
 * only need this module.
 *
 * A no-op outside a DOM environment (SSR, a worker) rather than throwing.
 *
 * @param paused - The new pause state to store and broadcast.
 */
export function setCabinetRuntimePaused(paused: boolean) {
  // No environment has `document` without `window` -- they're the same
  // global in every browser and in jsdom -- so this one guard covers both.
  if (typeof document === "undefined") return;

  document.documentElement.dataset.cabinetPaused = String(paused);
  window.dispatchEvent(
    new CustomEvent<CabinetPauseChangeDetail>(PAUSE_EVENT, { detail: { paused } })
  );
}

/**
 * Read the current pause flag. A game's render/update loop calls this once
 * per frame to decide whether to advance simulation.
 *
 * @returns `true` if {@link setCabinetRuntimePaused} was last called with
 *   `true`; `false` otherwise, including outside a DOM environment.
 */
export function isCabinetRuntimePaused() {
  return (
    typeof document !== "undefined" && document.documentElement.dataset.cabinetPaused === "true"
  );
}

/** Shorthand for `setCabinetRuntimePaused(false)`. */
export function clearCabinetRuntimePaused() {
  setCabinetRuntimePaused(false);
}

const PAUSE_EVENT = "arcade-cabinet:pause-change";

export interface CabinetPauseChangeDetail {
  paused: boolean;
}

export function setCabinetRuntimePaused(paused: boolean) {
  if (typeof document === "undefined") return;

  document.documentElement.dataset.cabinetPaused = String(paused);

  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent<CabinetPauseChangeDetail>(PAUSE_EVENT, { detail: { paused } })
    );
  }
}

export function isCabinetRuntimePaused() {
  return (
    typeof document !== "undefined" && document.documentElement.dataset.cabinetPaused === "true"
  );
}

export function clearCabinetRuntimePaused() {
  setCabinetRuntimePaused(false);
}

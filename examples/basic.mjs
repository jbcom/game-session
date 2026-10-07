// Runs a full session lifecycle without a browser: begin a run, checkpoint it,
// finish it, and read the recorded progress back. Any object with
// getItem/setItem/removeItem works as storage, so this uses an in-memory one.
import { getSessionTuning, normalizeSessionMode } from "game-session";
import {
  beginGameRun,
  finishGameRun,
  readGameProgress,
  readGameSaveSlot,
  updateGameRun,
} from "game-session/react";

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    removeItem: (key) => map.delete(key),
    setItem: (key, value) => map.set(key, String(value)),
  };
}

const storage = memoryStorage();
const namespace = "example:v1";
const slug = "puzzle-quest";

// Untrusted input (a URL parameter, a stale stored value) always resolves to a valid mode.
const mode = normalizeSessionMode("challenge");
console.log({ mode, tuning: getSessionTuning(mode).targetMinutes });

beginGameRun(slug, mode, { progressSummary: "Level 1" }, storage, namespace);
updateGameRun(slug, { progressSummary: "Level 2" }, storage, namespace);
console.log({ resume: readGameSaveSlot(slug, storage, namespace)?.progressSummary });

const { progress, result } = finishGameRun(
  slug,
  { mode, score: 1200, status: "completed", milestones: ["first-clear"] },
  storage,
  namespace
);
console.log({ result: result.summary, bestScore: progress.bestScore });
console.log({ stored: readGameProgress(slug, storage, namespace).sessionsCompleted });

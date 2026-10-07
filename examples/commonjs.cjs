// The same package from CommonJS: the pure-logic entry needs no storage at all.
const { createEmptyProgress, createGameResult, recordGameResult } = require("game-session");

const result = createGameResult({
  mode: "standard",
  score: 640,
  slug: "puzzle-quest",
  startedAt: new Date("2026-01-01T12:00:00Z"),
  endedAt: new Date("2026-01-01T12:09:30Z"),
  status: "completed",
});

const progress = recordGameResult(createEmptyProgress("puzzle-quest"), result, ["first-clear"]);
console.log({ bestScore: progress.bestScore, durationMs: result.durationMs });

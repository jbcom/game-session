#!/usr/bin/env node
// Packed-consumer smoke test. Packs the package, checks the tarball contents,
// then installs that tarball into an empty scratch project against the public
// npm registry only (no scoped registry, no token) and imports every entry
// point under both ESM and CommonJS.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npmNeedsShell = process.platform === "win32";

// pnpm forwards its own npm_config_* settings to child processes, and newer npm
// versions warn about pnpm-only keys, so give npm a clean configuration while
// keeping PATH, HOME and the rest of the environment. The registry is pinned to
// the public one and the user config is emptied so no local token or scoped
// registry can influence the install. SKIP_INSTALL_SIMPLE_GIT_HOOKS silences the
// git-hook installer that `prepare` runs during `npm pack`.
const npmEnvironment = {
  ...Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.toLowerCase().startsWith("npm_config_"))
  ),
  SKIP_INSTALL_SIMPLE_GIT_HOOKS: "1",
  npm_config_registry: "https://registry.npmjs.org/",
  npm_config_userconfig: process.platform === "win32" ? "NUL" : "/dev/null",
};

const ROOT_FUNCTIONS = [
  "clearGameRuntimePaused",
  "createActiveSaveSlot",
  "createEmptyProgress",
  "createGameResult",
  "getSessionPressureScale",
  "getSessionRecoveryScale",
  "getSessionTuning",
  "isGameRuntimePaused",
  "markProgressStarted",
  "normalizeGameProgress",
  "normalizeGameSaveSlot",
  "normalizeGameSettings",
  "normalizeSessionMode",
  "recordGameResult",
  "setGameRuntimePaused",
  "updateActiveSaveSlot",
];
const ROOT_VALUES = [
  "DEFAULT_DIFFICULTY_VARIANTS",
  "DEFAULT_GAME_SETTINGS",
  "DEFAULT_SESSION_MODE",
  "DEFAULT_SESSION_TUNING",
  "SESSION_MODES",
];
const REACT_FUNCTIONS = [
  "abandonGameRun",
  "applySettingsToDocument",
  "beginGameRun",
  "clearGameSaveSlot",
  "finishGameRun",
  "readGameProgress",
  "readGameSaveSlot",
  "readGameSettings",
  "updateGameRun",
  "useGameRuntime",
  "writeGameProgress",
  "writeGameSaveSlot",
  "writeGameSettings",
];
const UI_COMPONENTS = [
  "GameErrorBoundary",
  "GameMenuButton",
  "GamePauseMenu",
  "GameSettingsPanel",
  "RuntimeResultRecorder",
];

function memoryStorage() {
  const map = new Map();
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function assertSurface(label, root, react, ui) {
  for (const name of ROOT_FUNCTIONS) {
    assert.equal(typeof root[name], "function", `${label}: root export ${name} is missing`);
  }
  for (const name of ROOT_VALUES) {
    assert.notEqual(root[name], undefined, `${label}: root export ${name} is missing`);
  }
  for (const name of REACT_FUNCTIONS) {
    assert.equal(typeof react[name], "function", `${label}: react export ${name} is missing`);
  }
  assert.equal(react.DEFAULT_STORAGE_NAMESPACE, "game-session:v1", `${label}: namespace default`);
  for (const name of UI_COMPONENTS) {
    assert.equal(typeof ui[name], "function", `${label}: ui export ${name} is missing`);
  }
}

// A small deterministic run through the storage-backed API, to prove the ESM
// and CommonJS builds behave identically.
function runLifecycle(react, runtimeMode) {
  const storage = memoryStorage();
  react.beginGameRun("smoke-game", runtimeMode, {}, storage, "smoke:v1");
  const { progress } = react.finishGameRun(
    "smoke-game",
    { mode: runtimeMode, score: 42, status: "completed", now: new Date("2026-01-01T00:00:00Z") },
    storage,
    "smoke:v1"
  );
  assert.equal(react.readGameSaveSlot("smoke-game", storage, "smoke:v1"), undefined);
  return {
    bestScore: progress.bestScore,
    sessionsCompleted: progress.sessionsCompleted,
    sessionsStarted: progress.sessionsStarted,
  };
}

const workDir = mkdtempSync(path.join(tmpdir(), "game-session-package-"));

try {
  const packOutput = execFileSync(
    npm,
    ["pack", "--pack-destination", workDir, "--ignore-scripts", "--json"],
    { cwd: packageRoot, encoding: "utf8", env: npmEnvironment, shell: npmNeedsShell }
  );
  const jsonEnd = packOutput.lastIndexOf("]");
  assert(jsonEnd !== -1, `npm pack produced no JSON array:\n${packOutput}`);
  let pack;
  for (const match of packOutput.matchAll(/^\[/gm)) {
    try {
      [pack] = JSON.parse(packOutput.slice(match.index, jsonEnd + 1));
      break;
    } catch {
      // Not the real array start (for example an "[INFO] ..." line); try the next "[".
    }
  }
  assert(pack, `npm pack did not return a parseable package manifest:\n${packOutput}`);

  const packedPaths = new Set(pack.files.map((file) => file.path));
  const required = [
    "LICENSE",
    "README.md",
    "CHANGELOG.md",
    "package.json",
    "docs/API.md",
    "docs/ARCHITECTURE.md",
    "examples/basic.mjs",
    "examples/commonjs.cjs",
  ];
  for (const entry of ["index", "react", "ui"]) {
    required.push(
      `dist/esm/${entry}.js`,
      `dist/esm/${entry}.d.ts`,
      `dist/cjs/${entry}.cjs`,
      `dist/cjs/${entry}.d.cts`
    );
  }
  for (const file of required) {
    assert(packedPaths.has(file), `packed artifact is missing ${file}`);
  }
  for (const forbiddenPrefix of ["src/", "tests/", "coverage/", "scripts/"]) {
    assert(
      [...packedPaths].every((file) => !file.startsWith(forbiddenPrefix)),
      `packed artifact unexpectedly contains ${forbiddenPrefix}`
    );
  }

  const consumerRoot = path.join(workDir, "consumer");
  mkdirSync(consumerRoot);
  writeFileSync(
    path.join(consumerRoot, "package.json"),
    `${JSON.stringify({ private: true, type: "module" })}\n`
  );
  // The root entry has no dependencies; ./react and ./ui need their optional
  // peers, which a real consumer installs themselves.
  execFileSync(
    npm,
    [
      "install",
      "--no-audit",
      "--no-fund",
      path.join(workDir, pack.filename),
      "react@19",
      "react-dom@19",
      "lucide-react",
    ],
    { cwd: consumerRoot, env: npmEnvironment, shell: npmNeedsShell, stdio: "pipe" }
  );

  // Surface and behaviour, ESM then CommonJS, from the installed tarball.
  const esmSurface = execFileSync(
    process.execPath,
    [
      "--input-type=module",
      "--eval",
      `
      import assert from "node:assert/strict";
      import { createElement } from "react";
      import { renderToString } from "react-dom/server";
      import * as root from "game-session";
      import * as react from "game-session/react";
      import * as ui from "game-session/ui";
      const surface = ${JSON.stringify({
        ROOT_FUNCTIONS,
        ROOT_VALUES,
        REACT_FUNCTIONS,
        UI_COMPONENTS,
      })};
      for (const n of surface.ROOT_FUNCTIONS) assert.equal(typeof root[n], "function", n);
      for (const n of surface.ROOT_VALUES) assert.notEqual(root[n], undefined, n);
      for (const n of surface.REACT_FUNCTIONS) assert.equal(typeof react[n], "function", n);
      for (const n of surface.UI_COMPONENTS) assert.equal(typeof ui[n], "function", n);
      const html = renderToString(createElement(ui.GamePauseMenu, {
        gameTitle: "Smoke Game", open: true, settings: root.DEFAULT_GAME_SETTINGS,
        onMainMenu() {}, onClose() {}, onQuitRun() {}, onRestart() {}, onSettingsChange() {},
      }));
      assert(html.includes("Smoke Game") && html.includes("Main Menu"), "pause menu did not render");
      process.stdout.write("ok");
      `,
    ],
    { cwd: consumerRoot, encoding: "utf8" }
  );
  assert.equal(esmSurface, "ok", "installed ESM smoke failed");

  const cjsSurface = execFileSync(
    process.execPath,
    [
      "--input-type=commonjs",
      "--eval",
      `
      const assert = require("node:assert/strict");
      const { createElement } = require("react");
      const { renderToString } = require("react-dom/server");
      const root = require("game-session");
      const react = require("game-session/react");
      const ui = require("game-session/ui");
      const surface = ${JSON.stringify({
        ROOT_FUNCTIONS,
        ROOT_VALUES,
        REACT_FUNCTIONS,
        UI_COMPONENTS,
      })};
      for (const n of surface.ROOT_FUNCTIONS) assert.equal(typeof root[n], "function", n);
      for (const n of surface.ROOT_VALUES) assert.notEqual(root[n], undefined, n);
      for (const n of surface.REACT_FUNCTIONS) assert.equal(typeof react[n], "function", n);
      for (const n of surface.UI_COMPONENTS) assert.equal(typeof ui[n], "function", n);
      const html = renderToString(createElement(ui.GamePauseMenu, {
        gameTitle: "Smoke Game", open: true, settings: root.DEFAULT_GAME_SETTINGS,
        onMainMenu() {}, onClose() {}, onQuitRun() {}, onRestart() {}, onSettingsChange() {},
      }));
      assert(html.includes("Smoke Game") && html.includes("Main Menu"), "pause menu did not render");
      process.stdout.write("ok");
      `,
    ],
    { cwd: consumerRoot, encoding: "utf8" }
  );
  assert.equal(cjsSurface, "ok", "installed CommonJS smoke failed");

  // The built-in (workspace) ESM and CommonJS builds must agree on behaviour.
  const esm = {
    root: await import(path.join(packageRoot, "dist/esm/index.js")),
    react: await import(path.join(packageRoot, "dist/esm/react.js")),
    ui: await import(path.join(packageRoot, "dist/esm/ui.js")),
  };
  const require = createRequire(import.meta.url);
  const cjs = {
    root: require(path.join(packageRoot, "dist/cjs/index.cjs")),
    react: require(path.join(packageRoot, "dist/cjs/react.cjs")),
    ui: require(path.join(packageRoot, "dist/cjs/ui.cjs")),
  };
  assertSurface("ESM", esm.root, esm.react, esm.ui);
  assertSurface("CommonJS", cjs.root, cjs.react, cjs.ui);
  assert.deepEqual(
    runLifecycle(esm.react, "challenge"),
    runLifecycle(cjs.react, "challenge"),
    "ESM and CommonJS builds produced different lifecycle results"
  );

  console.log(
    `game-session: installed ${pack.entryCount} intentional files; ESM and CommonJS APIs agree`
  );
} finally {
  rmSync(workDir, { recursive: true, force: true });
}

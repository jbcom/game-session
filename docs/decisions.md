---
title: Decisions
description: Why game-session is shaped the way it is.
---

## 2026-10-07: published unscoped as `game-session`

**Decision.** The npm name is `game-session`, with no scope.

**Why.** A scope adds nothing for a general-purpose package and makes it harder
to find. The bare name was free on npm.

## 2026-10-07: neutral names for the whole public API before the first publish

**Decision.** Every export, prop, visible string and DOM hook that named one
host app was renamed to a neutral one (`useGameRuntime`, `GamePauseMenu`,
`setGameRuntimePaused`, `onMainMenu`, `data-game-paused`, `--game-text-scale`,
...). The full mapping is in [Migrating from the earlier names](./MIGRATION/).

**Why.** Names cannot change cheaply once a package is on npm. The pause menu
also stopped hard-coding a header line: an optional `eyebrow` prop renders one
only when a caller supplies it.

## 2026-10-07: dual build from two `tsc` runs, no bundler

**Decision.** `scripts/build.mjs` emits ESM to `dist/esm` and CommonJS to
`dist/cjs` from two tsconfigs, renames the CommonJS output to `.cjs`/`.d.cts`
and rewrites its relative specifiers.

**Why.** Each source module maps one-to-one to a built module, so there is
nothing for a bundler to do. Separate declaration files for each format avoid
the "masquerading as ESM" resolution problem. The earlier layout copied ESM
declarations to `.d.cts` and left the CommonJS files requiring `./x.js`, which
resolved to the ESM build.

## 2026-10-07: the `lucide-react` peer range is `>=0.400.0 <2.0.0`

**Decision.** The optional peer admits every release from 0.400.0 through 1.x.

**Why.** A caret on a `0.x` version admits only one minor, so `^0.400.0` rejected
the version the package is tested with. The icons used exist in both the 0.x and
1.x lines, and the test suite runs against 1.x.

## 2026-10-07: Toolchain

Node 26 and pnpm 12 to build, TypeScript 7 (native) to compile. `engines.node`
stays `>=24` with no ceiling and `@types/node` stays on 24, because a library
must not reach for an API its oldest supported runtime lacks. CI runs Node 24 and
26 on Linux only: the package touches no paths or processes at runtime.

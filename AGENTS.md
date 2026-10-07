# Agent notes

This file is for an autonomous coding agent working in this repository. It
covers what isn't obvious from reading the code alone.

## Toolchain

- Node 26 and pnpm 12 to build (`.nvmrc`, `mise.toml`, `package.json#packageManager`),
  TypeScript 7 to compile. Supported Node.js lines are 22, 24 and 26;
  `engines.node` is `>=22`. Do not use an API Node 22 lacks.
- This is a pnpm workspace with two members: `.` (the published library) and
  `docs/` (the private Sourcey site). Root scripts operate on the library;
  `pnpm docs:*` delegate to `docs/`.
- `pnpm verify` is the single gate CI runs: Biome lint, markdownlint, strict
  TypeScript over `src` and `tests`, the full test suite at 100% coverage
  thresholds, the dual-format build, both runnable examples, `publint`, Are The
  Types Wrong, and a packed-tarball install into an empty project. A change is
  not done while any part of it is red.

## Core invariants: do not violate these when editing `src/`

Full detail in `docs/ARCHITECTURE.md`.

1. Reads normalize and never throw; writes swallow storage failures.
2. A `GameSaveSlot` exists only while a run is `"active"`; a finished run is a
   `GameResult` folded into `GameProgress`.
3. The `slug` the caller passes always wins over a slug found inside stored data.
4. Pause state is a document attribute plus a window event, never React state.
5. The root entry imports nothing; `react` and `ui` stay separate entry points.
6. Public names are neutral. Do not put the name of any game, studio or host app
   in code, comments, docs, tests or fixtures; use generic examples such as
   `puzzle-quest`.

## Keeping docs and tests in sync

A change to a public export needs matching updates in `tests/` (100% coverage),
`docs/API.md`, `docs/ARCHITECTURE.md` when a boundary or invariant moves, and
the README when the quick start changes. `docs/MIGRATION.md` records renames.

## Commits and releases

Conventional Commits only. Release Please owns `CHANGELOG.md` and versions.
`pre-commit`, `simple-git-hooks`, `lint-staged` and `commitlint` run locally
after `pnpm install`; never bypass them with `--no-verify`.

## Files most likely to surprise you

- `scripts/build.mjs` builds ESM and CommonJS from two tsconfigs and renames the
  CommonJS output; TypeScript 7 exports a fixed subpath set, so it resolves `tsc`
  through the package manifest.
- `tests/setup.ts` mirrors jsdom's `localStorage` onto `globalThis` because
  Node 26's experimental global shadows it under Vitest.
- `pnpm-workspace.yaml`'s `allowBuilds` controls which install scripts run.

---
title: Contributing
description: Set up game-session, validate a change, and contribute through the protected workflow.
---

## Local workflow

```sh
mise install
pnpm install --frozen-lockfile
pnpm verify
pnpm docs:build
```

`pnpm verify` is the library gate: Biome, Markdown linting, strict TypeScript,
100% coverage, the dual-format build, runnable examples, package validation
(`publint`, Are The Types Wrong) and a clean-consumer runtime check that installs
the packed tarball into an empty project. `pnpm docs:build` validates and renders
the Sourcey site.

Branch from `main`, make a focused Conventional Commit, open a pull request, and
keep the branch current by merging `main` into it when necessary. The protected
path uses automated checks rather than a routine human approval; merge commits
preserve the constituent history. Do not hand-edit versions or `CHANGELOG.md`:
Release Please owns them.

Read the repository [contribution guide](https://github.com/jbcom/game-session/blob/main/CONTRIBUTING.md)
and [agent instructions](https://github.com/jbcom/game-session/blob/main/AGENTS.md)
before changing public APIs.

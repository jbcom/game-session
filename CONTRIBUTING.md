# Contributing

Thanks for taking the time to contribute.

## Getting set up

```sh
mise install            # Node 26 and pnpm 12, or use corepack
pnpm install --frozen-lockfile
pnpm verify             # lint, docs lint, typecheck, coverage, build, examples, package checks
pnpm docs:build         # the Sourcey documentation site
```

Node and pnpm versions are pinned in `.nvmrc` and `package.json#packageManager`.
Use `corepack` or `mise` rather than a globally installed pnpm so your version
matches CI.

## Making a change

1. Branch off `main`.
2. Write the test first. A bug fix should come with a test that fails without it.
   Coverage is gated at 100%.
3. Run `pnpm verify`. A change is not ready while any part of that is red.
4. Commit with [Conventional Commits](https://www.conventionalcommits.org):
   `fix:`, `feat:`, `docs:`, `refactor:`, `test:`, `chore:`. This is enforced by
   commitlint, and it is what drives the changelog and the next version number.
5. Open a pull request describing what changed and why.

## What gets reviewed

- Does it do what it says, and is there a test proving it?
- Does it keep the public API honest? A breaking change needs a `!` or a
  `BREAKING CHANGE:` footer.
- Are the types right for consumers? `pnpm verify` runs `publint`,
  `arethetypeswrong` and a packed-consumer smoke test because broken types only
  surface at integration time.
- Do the docs match? Public API changes update `docs/API.md` and the README.

## Releases

Releases are automated. Merging a conventional commit to `main` opens a
release pull request; merging that publishes to npm with provenance. Do not
hand-edit versions or the changelog.

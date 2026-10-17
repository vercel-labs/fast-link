# Contributing to Fast Link

Use the Node.js and pnpm versions in [`package.json`](./package.json).
Run commands from the repository root.

## Get started

```sh
pnpm install
pnpm validate
```

`pnpm validate` checks formatting, lint, package boundaries, release tooling,
builds, types, unit and browser tests, the Next.js fixture, and package sizes.
Run it before opening a pull request. All commits must be signed.

## Package boundaries

| Package            | Owns                                                    | Workspace dependencies |
| ------------------ | ------------------------------------------------------- | ---------------------- |
| `@fast-link/core`  | Eligibility, event ordering, click suppression, cleanup | None                   |
| `@fast-link/react` | React ref lifecycle for core controllers                | Core                   |
| `@fast-link/next`  | App Router Link, region navigation, routing decisions   | Core and React         |

Core must not import React or Next.js; the React package must not import Next.js.
Keep eligibility rules in core.

`pnpm boundaries` checks package imports and workspace dependency rules defined
in `packages/*/turbo.json`. It also runs during validation and in CI.

See [CONTEXT.md](./CONTEXT.md) for project terms and [docs/adr](./docs/adr/) for
architecture decisions.

## Write and run tests

Test behavior in the package that owns it. Extend existing tests and fixtures
where possible. Add coverage at another layer only for a distinct integration
failure.

Run focused tests while developing:

```sh
pnpm exec turbo run test --filter=@fast-link/core
```

Replace the package name to test React or Next.js. Use `pnpm test:browser` for
real pointer behavior and `pnpm test:fixtures` for production Next.js integration.
Both run in Chromium, Firefox, and WebKit.

### Keep tests fast

- Each new test should catch a failure the suite does not already cover.
- Wait for observable events or state. Explain fixed waits that check an action
  does not happen.
- Configure new test commands in the [Turbo task graph](./turbo.json), including
  required builds, cache inputs, and generated outputs. Keep browser checks
  uncached so they run on each validation.
- Compare repeated runs of the same command before claiming a speedup; record
  whether caches are cold or warm. Avoid strict wall-clock assertions.

### Test package installs

Check the [packed-consumers CI job](.github/workflows/ci.yml) when changing exports,
dependencies, shipped files, or Node.js requirements. It installs `pnpm pack`
archives in a fresh app to catch missing files and dependency problems that
workspace links can hide.

CI builds and packs on Node.js 24, then checks strict-engine installs, core and
React imports, public types, and a production Next.js build on Node.js 22, 24, and 26.

To check locally, build on Node.js 24, then prepare one archive set with the full
commit SHA to record as `gitHead`:

```sh
pnpm build
node scripts/prepare-package-artifacts.mjs <directory> <full-commit-sha>
node scripts/test-packed-consumers.mjs <directory> <full-commit-sha>
```

Run the consumer command under each supported Node.js version against that same
directory. Preparation packs each public package once, runs publint and repository
checks, and writes archive identities and SHA-256 digests to `release-artifacts.json`.
Consumers and publication verify this handoff before using the archives.
The release workflow performs these checks even while publication is disabled.

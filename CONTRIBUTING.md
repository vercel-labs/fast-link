# Contributing to Fast Link

Fast Link is a pnpm and Turborepo monorepo with separate packages for DOM
behavior, React lifecycle, and Next.js App Router integration.

## Requirements

Use the Node.js and pnpm versions specified in [`package.json`](./package.json).

## Set up the repository

Install dependencies and run the full validation suite from the repository root:

```sh
pnpm install
pnpm validate
```

`pnpm validate` checks formatting, linting, package boundaries, release tooling,
builds, types, unit and browser behavior, the Next.js fixture, and package sizes.

## Understand the package boundaries

| Package            | Responsibility                                                     |
| ------------------ | ------------------------------------------------------------------ |
| `@fast-link/core`  | Eligibility, event ordering, click suppression, and cleanup        |
| `@fast-link/react` | React ref lifecycle for core controllers                           |
| `@fast-link/next`  | App Router Link behavior, region navigation, and routing decisions |

Core must not import React or Next.js. The React package depends on core and
must not import Next.js. The Next.js package depends on both packages and must
not duplicate core eligibility rules.

Run `pnpm boundaries` to check workspace dependency direction and package imports.
Package tags in `packages/*/turbo.json` enforce that core has no workspace
dependencies, React may depend on core, and Next.js may depend on core and React.
The check also runs during validation and in CI. These tag rules apply to
workspace packages, not external npm dependencies.

Read [CONTEXT.md](./CONTEXT.md) for project terms and [docs/adr](./docs/adr/) for
accepted architecture decisions.

## Write and run tests

Add coverage in the package that owns the behavior. Extend an existing test
when possible; a new test should catch a failure the suite does not already cover.

Run focused tests while developing. For example,
`pnpm exec turbo run test --filter=@fast-link/core` runs the core unit suite.
Replace the package name to test React or Next.js behavior.

Use `pnpm test:browser` for real pointer behavior and `pnpm test:fixtures` for
production Next.js integration. Both run in Chromium, Firefox, and WebKit.
Run `pnpm validate` before opening a pull request.

### Keep tests fast

- Reuse existing fixtures and test behavior at its owning layer. Add coverage in
  another layer only when it catches a distinct integration failure.
- Wait for observable events or state rather than fixed delays. Explain waits
  used to verify that an action does not happen.
- For new test commands, configure the [Turbo task graph](./turbo.json) with the
  build dependencies, cache inputs, and generated outputs they need. Keep browser
  checks uncached so they execute on each validation run.
- Before claiming a speedup, compare repeated runs of the same command and note
  whether caches are cold or warm. Avoid strict wall-clock assertions in tests.

### Test package installs

Check the [packed-consumers CI job](.github/workflows/ci.yml) when changing exports,
dependencies, shipped files, or Node.js requirements. It installs archives from
`pnpm pack` in a fresh app, catching missing files and dependency problems that
workspace links can hide.

CI builds and packs on Node.js 24, then checks strict-engine installs, core and
React imports, public types, and a production Next.js build on Node.js 22 and 24.

To check local tarballs, run `node scripts/test-packed-consumers.mjs <directory>`
under the consumer Node.js version. The directory must contain `core.tgz`,
`react.tgz`, and `next.tgz`, packed from a completed Node.js 24 build.

## Prepare package changes

After the initial release, a change to package source, build configuration,
shipped files, or published manifest fields requires a version bump and a new
entry at the top of that package's changelog. Inspect the packed tarball for
every changed public package before opening a pull request.

All commits must be signed.

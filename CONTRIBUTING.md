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

## Test Next.js integrations

Run the built Next.js App Router fixture in Chromium, Firefox, and WebKit:

```sh
pnpm test:fixtures
```

## Test packed consumers

The [packed-consumers CI job](.github/workflows/ci.yml) builds and packs on Node.js
24, then installs the tarballs with strict engine checks on Node.js 22 and 24. It
checks core and React imports, public types, and a production Next.js build.

To check local tarballs, run `node scripts/test-packed-consumers.mjs <directory>`
under the consumer Node.js version. The directory must contain `core.tgz`,
`react.tgz`, and `next.tgz`, packed from a completed Node.js 24 build.

## Prepare package changes

After the initial release, a change to package source, build configuration,
shipped files, or published manifest fields requires a version bump and a new
entry at the top of that package's changelog. Inspect the packed tarball for
every changed public package before opening a pull request.

All commits must be signed.

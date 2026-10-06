# Contributing to Fast Link

Fast Link is a pnpm and Turborepo monorepo with separate packages for DOM
behavior, React lifecycle, and Next.js App Router integration.

## Requirements

- Node.js 24
- pnpm 10.32.1

## Set up the repository

Install dependencies and run the full validation suite from the repository root:

```sh
pnpm install
pnpm validate
```

`pnpm validate` checks generated fixtures, formatting, linting, release tooling,
builds, types, unit and browser behavior, Next.js fixtures, and package sizes.

## Understand the package boundaries

| Package            | Responsibility                                                     |
| ------------------ | ------------------------------------------------------------------ |
| `@fast-link/core`  | Eligibility, event ordering, click suppression, and cleanup        |
| `@fast-link/react` | React ref lifecycle for core controllers                           |
| `@fast-link/next`  | App Router Link behavior, region navigation, and routing decisions |

Core must not import React or Next.js. The React package depends on core and
must not import Next.js. The Next.js package depends on both packages and must
not duplicate core eligibility rules.

Read [CONTEXT.md](./CONTEXT.md) for project terms and [docs/adr](./docs/adr/) for
accepted architecture decisions.

## Test Next.js integrations

Run the built Next.js 15 and 16 App Router fixtures in Chromium, Firefox, and
WebKit:

```sh
pnpm test:fixtures
```

## Prepare package changes

After the initial release, a change to package source, build configuration,
shipped files, or published manifest fields requires a version bump and a new
entry at the top of that package's changelog. Inspect the packed tarball for
every changed public package before opening a pull request.

All commits must be signed.

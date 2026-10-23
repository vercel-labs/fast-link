# Contributing to Fast Link

Use the Node.js and pnpm versions in [`package.json`](./package.json).
Run commands from the repository root.

## Get started

```sh
pnpm install
```

All commits must be signed. CI runs the checks required for each pull request.

## Package boundaries

| Package            | Owns                                                    | Workspace dependencies |
| ------------------ | ------------------------------------------------------- | ---------------------- |
| `@fast-link/core`  | Eligibility, event ordering, click suppression, cleanup | None                   |
| `@fast-link/react` | React ref lifecycle for core controllers                | Core                   |
| `@fast-link/next`  | App Router Link, region navigation, routing decisions   | Core and React         |

Core must not import React or Next.js; the React package must not import Next.js.
Keep eligibility rules in core.

See [CONTEXT.md](./CONTEXT.md) for project terms and [docs/adr](./docs/adr/) for
architecture decisions.

## Write and run tests

Test behavior in the package that owns it. Extend existing tests and fixtures
where possible. Add coverage at another layer only for a distinct integration
failure.

### Keep tests fast

- Each new test should catch a failure the suite does not already cover.
- Wait for observable events or state. Explain fixed waits that check an action
  does not happen.
- Configure new test commands in the [Turbo task graph](./turbo.json), including
  required builds, cache inputs, and generated outputs. Keep browser checks
  uncached so they run on each validation.
- Compare repeated runs of the same command before claiming a speedup; record
  whether caches are cold or warm. Avoid strict wall-clock assertions.

### Browser suites

Run `pnpm test:browser` for core browser tests and `pnpm test:fixtures` for the
Next.js fixture. Both commands build their prerequisites. Failed browser runs
save screenshots and traces under `test-results/`.

### Test package installs

Check the [packed-consumers CI job](.github/workflows/ci.yml) when changing exports,
dependencies, shipped files, or Node.js requirements. It installs `pnpm pack`
archives in a fresh app to catch missing files and dependency problems that
workspace links can hide.

### Framework support

React adapters support React `>=19 <20`; the Next.js adapter supports Next.js
`>=16 <17`. When adding support for a new major, update the peer ranges and
compatibility checks together. CI covers the minimum supported versions and
the pinned fixture.

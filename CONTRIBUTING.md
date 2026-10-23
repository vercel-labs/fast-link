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

`pnpm test:browser` runs the core targeting suite; `pnpm test:fixtures` runs
Next.js production fixture scenarios. Both use Playwright Test across Chromium,
Firefox, and WebKit, with fresh contexts, six workers, and no retries.
Turbo builds their prerequisites and runs the browser tasks uncached.

After building, run a focused scenario from the repository root:

```sh
pnpm exec playwright test --config scripts/browser/core.config.mjs --project=firefox --grep descendant
pnpm exec playwright test --config scripts/browser/next.config.mjs --project=chromium --grep 'keyboard activation'
```

Each invocation writes failures to a unique `test-results/core-*` or
`test-results/next-*` directory, including screenshots, traces, and page errors.
CI uploads these directories when a browser or packed minimum-version check fails.
Open a retained trace with `pnpm exec playwright show-trace <path-to-trace.zip>`.

The Next suite reuses one production server per invocation with a dynamic port.
Set `FAST_LINK_FIXTURE_DIR` to select an already built isolated fixture; resolved
Next, React, and React DOM versions must match that fixture's pinned manifest.
Use `--project=chromium` for the minimum-version packed consumer.

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

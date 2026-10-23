# Performance benchmarks

Run commands from the repository root with the Node.js and pnpm versions in
[`package.json`](../package.json).

## Run locally

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
results="$(mktemp -d)"
pnpm benchmark --output "$results/full.json"
```

- Add `--case core|react|next` to run one case.
- Save output outside source checkouts. Failed runs retain partial samples and errors; do not publish them.
- Local runs write JSON only; the README summary is maintained manually.

### Compare revisions

Run from the head checkout. Use a disposable base checkout with compatible public
APIs: comparison overwrites its benchmark fixture and may update workspace imports
and lock entries.

```sh
pnpm benchmark:compare --base /absolute/path/to/base-checkout --output "$results/comparison"
```

- Both revisions use the head workload, frozen installs, and forced production builds of the Next.js fixture and its dependencies. Each retains its own package source and external dependency versions.
- Base/head execution alternates on the same runner.
- Comparisons reuse Chromium and one server per checkout; each batch and navigation sample uses fresh browser contexts.
- `--case core|react|next` narrows an investigation. Both revisions must have matching scenario sets, units, sample counts, and runner environments.
- A valid slowdown succeeds. Invalid, incomplete, incompatible, or failed measurements fail and retain available JSON diagnostics.
- `base.json` and `head.json` combine the five batches per revision; individual batch files retain raw measurements. `verdict.json` records success or failure and elapsed comparison time.

## Scenario IDs

Raw JSON uses the IDs below. Braces list allowed values;
for example, `next.fast.100.update` measures updating 100 `FastLink` components.

| ID pattern                                                    | What and how                                                                | Why                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `core.{bare,core}.accepted`                                   | Dispatch mouse presses and clicks to bare DOM handlers or `createFastLink`. | Compare accepted-interaction costs.                          |
| `core.{bare,core}.ignored`                                    | Dispatch touch pointerdowns; require no navigation.                         | Measure ignored-input handling.                              |
| `react.{plain,react}.accepted`                                | Dispatch mouse presses and clicks to plain React anchors or `useFastLink`.  | Compare binding overhead during interaction.                 |
| `react.{plain,react}.ignored`                                 | Dispatch touch pointerdowns to the same React variants.                     | Measure ignored-input handling through React.                |
| `react.{plain,react}.1.{mount,update,unmount}`                | Mount, update, and unmount one plain or bound anchor.                       | Compare binding lifecycle costs.                             |
| `next.{next,fast,region}.{1,100,1000}.{mount,update,unmount}` | Commit matched lists of `next/link`, `FastLink`, or region links.           | Compare list costs as link count grows.                      |
| `next.{next,fast,region}.{warm,cold}.navigation`              | Time pointerdown to destination commit with verified router-cache state.    | Measure when destination content becomes available.          |
| `next.{next,fast,region}.{warm,cold}.pressDuration`           | Record actual pointerdown-to-pointerup time alongside navigation.           | Show how much of navigation latency includes the mouse hold. |

## Measurement conditions

- Counts, list sizes, and the requested mouse hold come from [`workload.mjs`](../scripts/benchmarks/workload.mjs) and are recorded in each report.
- Variants run sequentially in production Chromium at a 1280 by 720 viewport, reversing order each batch.

### Interaction costs

- Event construction and warmups run outside timing.
- Accepted interactions report microseconds per press/click pair. Ignored touch pointerdowns report microseconds per event.
- Checks cover navigation counts, click suppression, ignored input, and cleanup on retained anchors.
- Bare DOM and core share a counting callback; bare handlers omit core's eligibility checks. Synthetic events exclude hardware input latency.

### List lifecycle

- Each workload warms once, then times mount, update, and unmount in milliseconds around `flushSync`, including ref callbacks and layout effects. Paint and passive-effect completion are excluded.
- Updates change every href query and label.
- Next.js variants share wrapper and anchor structure. The region variant wraps `next/link` in `FastLinkRegion`.
- Checks cover rendered counts, changed content, updated React navigation callbacks, and cleanup.

### Navigation

- Real Playwright mouse input measures pointerdown capture to the destination's client layout effect, in milliseconds.
- All variants use the same requested mouse hold. Actual press-to-release duration is recorded separately.
- Source links stay mounted until the follow-up click is checked.
- Checks require committed content, one history entry, one follow-up click, and expected navigation and suppression counts.

Every navigation sample uses a new browser context with rendered-link prefetch disabled:

| Cache case | Before pressing                                                                     | During navigation        |
| ---------- | ----------------------------------------------------------------------------------- | ------------------------ |
| Warm       | Call public `router.prefetch` and await the response containing destination content | Require no route request |
| Cold       | Require no route request                                                            | Require a route request  |

A cache mismatch fails the run. These checks verify the client router cache;
the server and operating system caches are not cold.
Response completion, destination commit, and the follow-up click establish readiness;
the runner does not wait for unrelated network activity to stop.

### Read the results

- JSON retains individual samples, correctness checks, actual press durations, source identity, tested versions, and browser/host metadata.
- Summaries use unrounded samples for medians and minimum-to-maximum ranges. Single-link lifecycle timings can reach browser timer resolution.
- Five batch samples do not support useful p95/p99 estimates. Percentiles of interaction batch averages do not describe individual-interaction latency.
- Before claiming a difference, reproduce it, compare environments and ranges, and profile the limiting work separately from publication runs.
- These are controlled lab measurements. Claims about typical-user gains need user data.

## When to measure and publish

Run benchmarks when changing workloads or making performance claims. Measurements
are manual; correctness, packaging, and release CI continue independently.
There are no timing budgets, confirmation reruns, calibration, or overrides.

Publish evidence only to support public performance claims. A published report is
not a release prerequisite. Link the complete validated raw report and describe
its source revision, environment, workload, sample counts, medians, ranges, and
measurement limits. Keep the README summary manually maintained.

Navigation starts one press-to-release interval earlier. The historical workload's
85 ms hold is a configured input, not a typical-user gain or a speedup multiplier.
The [historical raw report](https://github.com/vercel-labs/fast-link/blob/fd4e030beb2f62dbf785b1066b564bccec43bcf0/local/fe6fd78dfb572725fccd5b37f555f61b536dda95/report.json)
records revision `fe6fd78dfb572725fccd5b37f555f61b536dda95` on a single Apple M4 Pro
running macOS, with five alternating batches. Existing historical reports remain
available at their original links.

## Change the benchmark code

| Responsibility                                 | Source                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------- |
| Workload counts, list sizes, and mouse hold    | `scripts/benchmarks/workload.mjs`                                         |
| Browser workloads and correctness checks       | `fixtures/next-16/app/benchmark/lab.tsx`                                  |
| Sequential measurement                         | `scripts/benchmarks/run.mjs`, `measure.mjs`, `navigation.mjs`             |
| Shared fixture server lifecycle                | `scripts/browser/fixture-server.mjs`                                      |
| Browser/server reuse and report capture        | `scripts/benchmarks/session.mjs`                                          |
| Checkout preparation and comparisons           | `scripts/benchmarks/prepare.mjs`, `compare.mjs`, `comparison-results.mjs` |
| Report validation and comparison compatibility | `scripts/benchmarks/report.mjs`                                           |

Run the report and comparison tests without GitHub access:

```sh
pnpm exec vitest run --globals scripts/benchmarks/benchmarks.spec.mjs
```

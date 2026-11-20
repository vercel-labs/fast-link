# Performance benchmarks

Run commands from the repository root with the Node.js and pnpm versions in
[`package.json`](../package.json).

## Run locally

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
results="$(mktemp -d)"
pnpm benchmark --output "$results/full.json"
```

- Add `--case core|react|next` to run one case.
- Add `--modes release,immediate,native` to run a subset of Fast Link modes.
- Add `--rtt 100` to run the [network navigation matrix](#network-navigation) with 100 ms of added round-trip time. Omitting `--rtt`, or passing `--rtt 0`, runs the localhost workload unchanged. A complete measurement is one default run plus one `--rtt 100` run.
- Before starting the server, `pnpm benchmark` runs a cached Turbo build of the Next.js fixture and its dependencies, so it measures the current working tree.
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
- The fixture calls Fast Link APIs only in `fixtures/next-16/app/benchmark/bindings.tsx`. For an older base, comparison replaces that file with a copy from `scripts/benchmarks/bindings/`: `click-preparation.tsx` for a base that exports `createClickPreparation` but not `createLinkInteraction` (pass `--modes release`), or `fast-link.tsx` for a base that exports `createFastLink` but not `createClickPreparation` (pass `--modes immediate`).
- `--case core|react|next` narrows an investigation. `--rtt MS` applies the same network delay to both revisions. Both revisions must have matching scenario sets, units, sample counts, and runner environments.
- A valid slowdown succeeds. Invalid, incomplete, incompatible, or failed measurements fail and retain available JSON diagnostics.
- `base.json` and `head.json` combine the five batches per revision; individual batch files retain raw measurements. `verdict.json` records success or failure and elapsed comparison time.

## Scenario IDs

Raw JSON uses the IDs below. Braces list allowed values;
for example, `next.fast.release.100.update` measures updating 100 `FastLink` components in release mode.
`{mode}` is `release`, `immediate`, or `native`; baselines have no mode.

| ID pattern                                                                                                                                               | What and how                                                                                            | Why                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `core.bare.{accepted,ignored}`, `core.core.{mode}.{accepted,ignored}`                                                                                    | Dispatch mouse press/click pairs or touch pointerdowns to bare DOM handlers or `createLinkInteraction`. | Compare accepted and ignored interaction costs.                       |
| `react.plain.{accepted,ignored}`, `react.react.{mode}.{accepted,ignored}`                                                                                | The same input to plain React anchors or `useLinkInteraction`.                                          | Compare binding overhead during interaction.                          |
| `react.{plain,react.{mode}}.1.{mount,rerender,update,unmount}`                                                                                           | Mount, rerender unchanged, update, and unmount one plain or bound anchor.                               | Compare binding lifecycle costs.                                      |
| `next.{next,fast.{mode},region.{mode}}.{1,100,1000}.{mount,rerender,update,unmount}`                                                                     | Commit matched lists of `next/link`, `FastLink`, or region links.                                       | Compare list costs as link count grows.                               |
| `next.{fast,region}.switch.{1,100,1000}.{mode}`                                                                                                          | Change every link's mode, in order, to the named mode.                                                  | Measure mode switches.                                                |
| `next.{next,fast.{mode},region.{mode}}.{warm,cold,prefetch}.hold{85,0}.navigation`                                                                       | Time pointerdown to destination commit with verified router-cache state.                                | Measure when destination content becomes available.                   |
| `next.{next,fast.{mode},region.{mode}}.{warm,cold,prefetch}.hold{85,0}.pressDuration`                                                                    | Record actual pointerdown-to-pointerup time alongside navigation.                                       | Show how much of navigation latency includes the hold.                |
| `next.{next,fast.{mode},region.{mode}}.{warm,cold,prefetch}.hold{85,0}.releaseToCommit`                                                                  | Time pointerup to destination commit; negative when commit precedes release.                            | Measure latency after the button is released.                         |
| `next.{next,fast.release,region.release,fast.immediate}.rtt{ms}.{static,dynamic}.{cold,prefetch}.hold{100,0}.{navigation,pressDuration,releaseToCommit}` | The same navigation timings through the delay proxy, only with `--rtt`.                                 | Measure gains when the route fetch costs network time or server work. |

## Measurement conditions

- Counts, list sizes, modes, cache states, and requested mouse holds come from [`workload.mjs`](../scripts/benchmarks/workload.mjs) and are recorded in each report.
- Variants run sequentially in production Chromium at a 1280 by 720 viewport, reversing order each batch.

### Interaction costs

- Event construction and warmups run outside timing.
- Accepted interactions report microseconds per press/click pair. Ignored touch pointerdowns report microseconds per event.
- Checks cover navigation counts, click suppression, ignored input, and cleanup on retained anchors.
- Bare DOM and core share a counting callback; bare handlers omit core's eligibility checks. Synthetic events exclude hardware input latency.

### List lifecycle

- Each workload warms once, then times mount, update, and unmount in milliseconds around `flushSync`, including ref callbacks and layout effects. Paint and passive-effect completion are excluded.
- Rerenders keep every prop. Updates change every href query and label.
- Mode switches mount the first selected mode outside timing, then time each change to the next mode, ending on the first. Checks require the same anchor elements.
- Next.js variants share wrapper and anchor structure. The region variant wraps `next/link` in `FastLinkRegion`.
- Checks cover rendered counts, changed content, updated React navigation callbacks, and cleanup.

### Navigation

- Real Playwright mouse input measures pointerdown capture to the destination's client layout effect, in milliseconds.
- On localhost, every variant runs with an 85 ms lab hold and with no inserted hold (`hold0`). Actual press-to-release duration is recorded separately; neither setting is typical human input.
- Each batch repeats every navigation scenario `navigationSamples` times, round-robin.
- Source links stay mounted until the follow-up click is checked.
- Checks require committed content, one history entry, one follow-up click, and expected navigation and suppression counts. Only immediate mode may commit before release. Release mode also requires the router's preparation method, available on the pinned Next.js canary with `experimental.prepareNavigation`.
- `navigationChecks` retain each sample's events and route fetch timings on the page clock.

Every navigation sample uses a new browser context:

| Cache case | Before pressing                                                                                                      | During navigation        |
| ---------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------ |
| Warm       | Disable rendered-link prefetch, call public `router.prefetch`, and await the response containing destination content | Require no route request |
| Cold       | Disable rendered-link prefetch and require no route request                                                          | Require a route request  |
| Prefetch   | Keep Next Link's default prefetch and await its response containing destination content                              | Record route requests    |

A cache mismatch fails the run. These checks verify the client router cache;
the server and operating system caches are not cold.
Response completion, destination commit, and the follow-up click establish readiness.
On localhost, the runner does not wait for unrelated network activity to stop.

### Network navigation

Localhost route fetches take a few milliseconds, which caps the release-mode gain
the localhost workload can show. `--rtt MS` measures a separate navigation matrix
through a delay proxy and records the RTT as `environment.rttMs`.
Reports without `rttMs` were measured on localhost.

The matrix in `workload.network` is fixed:

| Dimension   | Values                                                               | Why                                                                   |
| ----------- | -------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Destination | `static` (the target page), `dynamic`                                | A dynamic route can't be prefetched with its page data.               |
| Cache       | `cold`, `prefetch`                                                   | Warm navigation makes no route request, so delay can't change it.     |
| Hold        | 100 ms, 0 ms                                                         | 100 ms is an assumed typical human hold; 0 bounds the no-hold cost.   |
| Variant     | Next Link, `FastLink` and region in release, `FastLink` in immediate | Compares release mode with the baseline and with committing on press. |

- The hold is an assumption. In [clicksense](https://github.com/andyed/clicksense) production data (a README, not peer-reviewed; 2,795 clicks), 44% of holds fell in 80-120 ms and 38% in 120-160 ms. The localhost workload keeps its 85 ms hold so its reports stay comparable.
- The matrix has 32 scenarios. It runs in a separate invocation, so the default run keeps its scenarios and duration.
- Run other RTTs with `--rtt 50` or `--rtt 200`. Scenario IDs include the RTT, so reports and comparisons are compared only at the same RTT.
- `--rtt` measures only this matrix. It rejects `--case core` and `--case react` and records the `next` case. `--modes` removes variants whose mode isn't selected; Next Link always runs.

The proxy in [`delay-proxy.mjs`](../scripts/benchmarks/delay-proxy.mjs) sits between Chromium and the fixture server:

- It delays every TCP chunk by RTT/2 in each direction, in arrival order, and keeps streamed chunk boundaries.
- It models a warm keep-alive connection. Connection setup isn't delayed and bandwidth isn't limited.
- It buffers delayed chunks without backpressure, which is fine for fixture-sized payloads.
- Each sample loads and hydrates the source page without delay, then turns the delay on.
- Chrome DevTools Protocol latency emulation isn't used. It starts the response delay when the request is sent, so the delay overlaps server time instead of adding to it.

The dynamic destination, `fixtures/next-16/app/benchmark/dynamic`, calls `connection()` to render per request, then waits 150 ms on the server. Its checks differ from the static destination's:

- A prefetch must return a successful route response. It isn't required to contain destination content, because a dynamic prefetch carries none.
- Every navigation, cold or prefetched, must make exactly one route request after the press. Prefetch requests made before the press don't count.
- A dynamic route request may end as `net::ERR_ABORTED`, but only after a successful response. Any other failure, an abort without a successful response, or an abort on the static destination fails the run. Each `navigationChecks` entry records `beforeAborts` and `navigationAborts`, and the report's `routeAborts` totals them per scenario.

Chromium reports these aborts for Next Link, release and immediate, so Fast Link does not cause them. The proxy doesn't cause them either. On 2026-11-20, at the revision before this network matrix was added, Playwright request events over 12 pages each showed Next Link's default prefetch request aborted on 11 of 12 pages over a direct connection and on 3 of 12 through the proxy at 100 ms RTT. The navigation request was aborted on all 12 pages in both cases.

The underlying cause hasn't been established.
Destination commit still requires the destination content. Only the navigation request can deliver it, because a dynamic prefetch carries no page data.
The one-request check can't tell whether a prefetch was used, because a dynamic navigation makes one request either way; `beforeAborts` records aborted prefetches.

Before each press, a delayed run also waits until the page has had no request in flight for 50 ms. On a delayed network, a prefetch response triggers the destination's client chunk request only after it arrives. Without this wait, pressing during that load times the chunk instead of the navigation.

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

In immediate mode, navigation starts one press-to-release interval earlier. The
historical workload's 85 ms hold is a configured input, not a typical-user gain
or a speedup multiplier.
The [historical raw report](https://github.com/vercel-labs/fast-link/blob/fd4e030beb2f62dbf785b1066b564bccec43bcf0/local/fe6fd78dfb572725fccd5b37f555f61b536dda95/report.json)
records revision `fe6fd78dfb572725fccd5b37f555f61b536dda95` on a single Apple M4 Pro
running macOS, with five alternating batches. Existing historical reports remain
available at their original links.

## Change the benchmark code

| Responsibility                                 | Source                                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------------------------- |
| Workload counts, list sizes, and mouse hold    | `scripts/benchmarks/workload.mjs`                                                   |
| Browser workloads and correctness checks       | `fixtures/next-16/app/benchmark/lab.tsx`                                            |
| Navigation destinations                        | `fixtures/next-16/app/benchmark/target/`, `fixtures/next-16/app/benchmark/dynamic/` |
| Network delay                                  | `scripts/benchmarks/delay-proxy.mjs`                                                |
| Fast Link API calls per revision               | `fixtures/next-16/app/benchmark/bindings.tsx`, `scripts/benchmarks/bindings/`       |
| Sequential measurement                         | `scripts/benchmarks/run.mjs`, `measure.mjs`, `navigation.mjs`                       |
| Shared fixture server lifecycle                | `scripts/browser/fixture-server.mjs`                                                |
| Browser/server reuse and report capture        | `scripts/benchmarks/session.mjs`                                                    |
| Checkout preparation and comparisons           | `scripts/benchmarks/prepare.mjs`, `compare.mjs`, `comparison-results.mjs`           |
| Report validation and comparison compatibility | `scripts/benchmarks/report.mjs`                                                     |

Run the report and comparison tests without GitHub access:

```sh
pnpm exec vitest run --globals scripts/benchmarks/benchmarks.spec.mjs
```

# Performance benchmarks

Use this guide to run, investigate, or change Fast Link benchmarks.
Commands run from the repository root with Node.js 24 and the pinned pnpm version.

- Timing gates start report-only. Invalid work and infrastructure failures fail checks.
- Results describe controlled Chromium lab conditions. They do not establish typical-user gains.
- Keep the existing package-size checks required.

## Run locally

Install dependencies, install Chromium, and build production code:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
results="$(mktemp -d)"
```

Run the full suite or one case:

```sh
pnpm benchmark --output "$results/full.json"
pnpm benchmark --case core --output "$results/core.json"
pnpm benchmark --case react --output "$results/react.json"
pnpm benchmark --case next --output "$results/next.json"
```

- `--output` is required. Save results outside source checkouts.
- Failed runs retain available samples and errors. Do not publish those samples.

For a local README baseline:

- Keep host details, tested versions, source commit, and diagnostics in the linked JSON.
- Store raw JSON under `local/<source-commit>/` on `benchmark-results`.
- Keep `latest.json` for releases. Release publication replaces the README table.

### Compare revisions

Prepare disposable base and head checkouts with compatible public APIs.
Run from the head checkout:

```sh
pnpm benchmark:compare --base /absolute/path/to/base-checkout --output "$results/comparison"
```

The command:

- Copies the head benchmark fixture into base, including revisions that predate benchmarks.
- Adds missing core/React workspace imports and updates their local lock entries offline.
- Installs each revision's frozen dependencies and forces production builds.
- Alternates base/head execution for five batches on the same runner.
- Retains each revision's package source and external dependency versions in the comparison.

Options:

- `--case core|react|next` narrows an investigation. Omitting a gated metric fails the check.
- `--informational` validates work without timing thresholds. Releases use this option.
- CI comparisons run every case. Tested versions are recorded separately for base and head.

## Scenario IDs

Raw JSON uses the IDs below. Braces list allowed values;
for example, `next.fast.100.update` measures updating 100 `FastLink` components.

| ID pattern                                                    | What and how                                                                          | Why                                                          |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `core.{bare,core}.accepted`                                   | Dispatch mouse presses and follow-up clicks to bare DOM handlers or `createFastLink`. | Compare accepted-interaction dispatch costs.                 |
| `core.{bare,core}.ignored`                                    | Dispatch touch pointerdowns; require no navigation.                                   | Measure ignored-input handling.                              |
| `react.{plain,react}.accepted`                                | Dispatch mouse presses and clicks to plain React anchors or `useFastLink`.            | Compare binding overhead during interaction.                 |
| `react.{plain,react}.ignored`                                 | Dispatch touch pointerdowns to the same React variants.                               | Measure ignored-input handling through React.                |
| `react.{plain,react}.1.{mount,update,unmount}`                | Commit one anchor with `flushSync`; check content, callback updates, and cleanup.     | Compare binding lifecycle costs.                             |
| `next.{next,fast,region}.{1,100,1000}.{mount,update,unmount}` | Commit matched lists of `next/link`, `FastLink`, or region links.                     | Compare list costs as link count grows.                      |
| `next.{next,fast,region}.{warm,cold}.navigation`              | Time pointerdown to destination commit with verified router-cache state.              | Measure when destination content becomes available.          |
| `next.{next,fast,region}.{warm,cold}.pressDuration`           | Record actual pointerdown-to-pointerup time alongside navigation.                     | Show how much of navigation latency includes the mouse hold. |

Lifecycle IDs end in `mount` (insert links), `update` (change every href and label),
or `unmount` (remove links and verify cleanup). See the conditions below for
sample counts, timing boundaries, and correctness checks.

### README selection

- Tables follow the dependency order: Core, React, Next.js.
- Columns pair each workload with its baseline: bare DOM, a plain React anchor, or `next/link`.
- Use descriptive workload names in the README. Keep scenario IDs in this guide and raw JSON.
- Each cell shows one median time. The config bullets state the batch count, samples per scenario, mouse hold, and interaction workload.
- Keep ranges and individual samples in raw results. Five batch samples per scenario do not support useful p95 or p99 reporting.
- Core/React samples average 1,000 interactions, so their batch percentiles would not describe individual-interaction latency.
- Show interaction costs, warm/cold navigation, and lifecycle costs for 100 and 1,000 links.
- Keep actual press durations in raw results as input diagnostics.
- Keep single-link lifecycle timings in raw results. They can reach browser timer resolution and offer little comparison value there.
- Retain all 53 measurements and their correctness checks in the suite.

## Measurement conditions

Variants run sequentially in production Chromium at a 1280 by 720 viewport.
Variant order reverses each batch. Reports use unrounded samples for medians
and full minimum-to-maximum ranges.

### Interaction costs

- Core compares bare DOM handlers with `createFastLink`, using the same counting callback.
- React compares plain anchors with `useFastLink`.
- Each batch measures 1,000 synthetic mouse presses and follow-up clicks after 100 warmups.
- Accepted interactions report microseconds per press/click pair. Ignored touch pointerdowns report microseconds per event.
- Checks cover navigation counts, click suppression, ignored input, and cleanup on retained anchors.
- Bare handlers omit core's general eligibility checks. Synthetic events exclude hardware input latency.

### List lifecycle

- React measures one plain or bound anchor.
- Next.js measures `next/link`, `FastLink`, and `FastLinkRegion` containing `next/link`, at 1, 100, and 1,000 links.
- Each workload warms once, then times mount, update, and unmount in milliseconds.
- Timings wrap `flushSync` commits, including ref callbacks and layout effects. They exclude paint and passive-effect completion.
- Updates change every href query and label. Next.js variants share wrapper and anchor structure.
- Checks cover rendered counts, changed content, updated React navigation callbacks, and cleanup.

### Navigation

- Real Playwright mouse input requests an 85 ms hold for every variant. Actual press-to-release duration is recorded separately.
- Latency runs from pointerdown capture to the destination's client layout effect, in milliseconds.
- Source links stay mounted until the follow-up click is checked.
- Checks require committed content, one history entry, one follow-up click, and expected navigation and suppression counts.
- `next/link` waits for mouse release. Earlier navigation does not establish faster JavaScript execution.

Every navigation sample uses a new browser context with rendered-link prefetch disabled:

| Cache case | Before pressing                                                     | During navigation        |
| ---------- | ------------------------------------------------------------------- | ------------------------ |
| Warm       | Call public `router.prefetch` and await a successful route response | Require no route request |
| Cold       | Require no route request                                            | Require a route request  |

A cache mismatch fails the run. These checks verify the client router cache;
the server and operating system caches are not cold.

### Read the results

- JSON includes raw samples, units, correctness checks, elapsed time, commits, dirty status, and tested versions.
- Environment metadata includes the browser, Node, Playwright, CPU, memory, and operating system.
- Gates compare raw scenario medians. They do not subtract noisy variant medians or use rounded README values.
- Before claiming a difference, reproduce it, inspect load and profiles, identify the limiting work, and compare sample ranges.
- Profile separately from publication measurements. Claims about representative users need user data.

## CI checks

`Benchmarks / benchmark` runs for PRs, main pushes, and manual dispatches.

- Source, fixture, dependency, script, and workflow changes run measurements.
- Docs-only changes pass without building or measuring.
- CI uploads JSON artifacts for 90 days, including available results from failed runs.
- `verdict.json` records comparison time.
- `full-run.json` records setup, builds, and measurement time, ending before artifact upload. Queue time is excluded.
- Measure hosted elapsed time before adjusting the implementation. There is no preset time budget.

## Calibrate and enable gates

1. Manually dispatch the workflow with `calibrate` selected. It runs ten unchanged-code comparisons.
2. Retain the hosted artifact. Review `calibration.json`, all ten comparisons, and raw samples.
3. Select stable core/React metrics. Leave zero-resolution or unstable metrics report-only.
4. Propose budgets in `scripts/benchmarks/policy.json`, linking calibration evidence in the PR.
5. Obtain maintainer approval before enabling those metrics.

Each `metrics` entry needs an `absolute` budget in that metric's unit, above
observed noise. Calibration proposes twice the largest absolute median difference;
those proposals need approval. The relative budget starts at a provisional 10%;
it is not an industry standard.
Next.js list and navigation timings remain informational.

Exercise calibration locally with:

```sh
pnpm benchmark:compare --base "$PWD" --calibrate --output "$results/calibration"
```

Local calibration does not establish hosted-runner noise.

| Measurement outcome                                     | Check result                       |
| ------------------------------------------------------- | ---------------------------------- |
| Median exceeds both absolute and relative budgets       | Run one confirmation comparison    |
| Same metric exceeds both budgets again                  | Fail                               |
| Valid comparisons disagree                              | Pass as inconclusive               |
| Within budgets                                          | Pass                               |
| Invalid data, incorrect work, or infrastructure failure | Fail, including during calibration |

To investigate a regression, download the artifact, compare raw scenarios and
environments, rerun the affected case, and profile the limiting work.

## Approve an intentional regression

Before allowing overrides:

1. Configure required maintainer reviewers on the `benchmark-override` GitHub environment.
2. Approve a separate policy change setting `overridesEnabled` to `true`.

To override a confirmed timing regression:

1. Dispatch the workflow on the PR's current head branch.
2. Supply the PR base revision and `override_reason`.
3. Obtain the protected environment's approval before the run starts.

- The command verifies that required reviewers are configured.
- The artifact records the reason, confirmed cost, units, and original failure.
- Invalid data and infrastructure failures cannot be overridden.
- The successful check must belong to the PR's current head commit.
- Review budget changes separately from overrides.

## Publish release results

After the release publish job succeeds, its benchmark job:

1. Reads the previous measured source commit from `benchmark-results/latest.json`.
2. Remeasures that commit and the release on the same runner using the current workload.
3. Saves raw batches, combined reports, navigation checks, and the verdict under `results/<source-commit>/`.
4. Opens or updates `runewolf/benchmark-readme-<commit>` with the generated README table.

Publication rules:

- The first measured release has no previous-release comparison. Later comparisons add no cumulative timing gate.
- The pointer stores the predecessor, so retries keep the same comparison. No tags or GitHub Release assets are assumed.
- An incompatible or unbuildable baseline fails publication for investigation. Do not substitute another baseline.
- A release rerun fails if the latest measured release is not its ancestor. It cannot move results backward.
- An empty publish allowlist prevents release benchmark publication. npm Trusted Publishing restrictions still apply.

The README's collapsible comparisons include descriptive workloads, explicit
baseline columns, units, medians, run conditions, and durable JSON links.
Previous-release samples stay in the raw results.
Values use two significant figures and omit run timestamps.
Identical generated content produces no PR.

### GitHub setup and review

- Allow GitHub Actions to create PRs in repository settings.
- Only the release benchmark job has contents and PR write permissions. Benchmark PR runs have read access.
- The publisher uses `createCommitOnBranch` and verifies GitHub's returned signature. It uses no npm write token.
- On an automated docs PR, select **Approve workflows to run** to start required checks. See [GitHub's workflow-trigger rules](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow#triggering-a-workflow-from-a-workflow).
- Review claims against raw samples before merging. Durable JSON outlives CI artifact retention.

## Change the benchmark code

| Responsibility                                   | Source                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| Browser workloads and correctness checks         | `fixtures/next-16/app/benchmark/lab.tsx`                                    |
| Sequential measurement and fixture server        | `scripts/benchmarks/run.mjs`, `measure.mjs`, `server.mjs`, `navigation.mjs` |
| Checkout preparation and comparisons             | `scripts/benchmarks/prepare.mjs`, `compare.mjs`, `comparison-results.mjs`   |
| Report validation and timing gates               | `scripts/benchmarks/report.mjs`, `policy.json`                              |
| CI selection, overrides, and verdict enforcement | `scripts/benchmarks/ci.mjs`                                                 |
| Release baseline and GitHub publication          | `scripts/benchmarks/baseline.mjs`, `publish.mjs`, `github.mjs`              |
| README markers and table rendering               | `scripts/benchmarks/readme.mjs`                                             |

Run report, gate, and publication tests without GitHub access:

```sh
pnpm exec vitest run --globals scripts/benchmarks.spec.mjs scripts/benchmark-publication.spec.mjs
```

Preserve the browser-side timing boundaries and correctness checks when refactoring.

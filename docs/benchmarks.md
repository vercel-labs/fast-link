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
- Local runs write JSON only. [Release publication](#publish-release-results) generates the README.

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
- `--case core|react|next` narrows an investigation. Omitting a gated metric fails the check.
- `--informational` validates work without timing thresholds.

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
- Gates compare raw scenario medians. They do not subtract noisy variant medians or use rounded README values.
- Before claiming a difference, reproduce it, compare environments and ranges, and profile the limiting work separately from publication runs.
- These are controlled lab measurements. Claims about typical-user gains need user data.

## Present results in the README

[`readme.mjs`](../scripts/benchmarks/readme.mjs) generates tables from validated reports.

- Show plain workload names, explicit baselines, median times, and units.
- Show the recorded batch count, interaction count, warmups, and requested mouse hold.
- Show only the recorded CPU model and OS in a small note below the tables. Regeneration uses the report, not the publishing machine.
- Keep individual samples, diagnostics, full environment details, and previous-release comparisons in linked raw results.
- Explain that `next/link` waits for mouse release; earlier navigation does not establish faster JavaScript execution or typical-user gains.
- Changing displayed rows must preserve the underlying measurements and correctness checks.

## CI checks

`Benchmarks / benchmark` runs for PRs, main pushes, and manual dispatches.

- Source, fixture, dependency, script, and workflow changes run measurements.
- Docs-only changes pass without building or measuring.
- Timing gates are currently report-only. Invalid work and infrastructure failures fail checks.
- CI uploads JSON artifacts for 90 days, including available results from failed runs.
- `verdict.json` records comparison time.
- `full-run.json` records setup, builds, and measurement time, ending before artifact upload. Queue time is excluded.

## Calibrate and enable gates

1. Manually dispatch the workflow with `calibrate` selected. It runs ten unchanged-code comparisons.
2. Review `calibration.json` and raw samples in the hosted artifact. Select stable core/React metrics; leave zero-resolution or unstable metrics report-only.
3. Propose budgets in [`policy.json`](../scripts/benchmarks/policy.json), linking the artifact in the PR.
4. Obtain maintainer approval before enabling metrics.

- Each metric needs an `absolute` budget in its unit, above observed noise. Calibration proposes twice the largest absolute median difference.
- The relative budget starts at a provisional 10%.
- Next.js list and navigation timings remain informational.

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

## Approve an intentional regression

Before allowing overrides:

1. Configure required maintainer reviewers on the `benchmark-override` GitHub environment.
2. Approve a separate policy change setting `overridesEnabled` to `true`.

To override a confirmed timing regression:

1. Dispatch the workflow on the PR's current head branch.
2. Supply the PR base revision and `override_reason`. Budget changes require separate review.
3. Obtain the protected environment's approval before the run starts.

The command verifies required reviewers and records the reason, measured cost,
and original failure in the artifact. Invalid work and infrastructure failures
cannot be overridden.

## Publish release results

After the release publish job succeeds, its benchmark job:

1. Reads the previous measured source commit from `benchmark-results/latest.json`.
2. Remeasures that commit and the release on the same runner using the current workload.
3. Saves reports under `results/<source-commit>/` on `benchmark-results` and updates `latest.json`.
4. Opens or updates a README PR when generated content differs from main.

- The first measured release has no previous-release comparison. Release timings are informational.
- The pointer stores the predecessor, so retries keep the same comparison.
- An incompatible or unbuildable baseline fails publication for investigation. Do not substitute another baseline.
- A release rerun fails if the latest measured release is not its ancestor. It cannot move results backward.
- An empty [publish allowlist](../scripts/publishable-packages.json) prevents release benchmark publication.
- Manually published local results belong under `local/<source-commit>/` on `benchmark-results`. Reserve `latest.json` for releases, whose publication replaces the README table.

### GitHub setup and review

- Allow GitHub Actions to create PRs in repository settings.
- On an automated docs PR, select **Approve workflows to run** to start required checks. See [GitHub's workflow-trigger rules](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow#triggering-a-workflow-from-a-workflow).

## Change the benchmark code

| Responsibility                                   | Source                                                                      |
| ------------------------------------------------ | --------------------------------------------------------------------------- |
| Workload counts, list sizes, and mouse hold      | `scripts/benchmarks/workload.mjs`                                           |
| Browser workloads and correctness checks         | `fixtures/next-16/app/benchmark/lab.tsx`                                    |
| Sequential measurement and fixture server        | `scripts/benchmarks/run.mjs`, `measure.mjs`, `server.mjs`, `navigation.mjs` |
| Browser/server reuse and report capture          | `scripts/benchmarks/session.mjs`                                            |
| Checkout preparation and comparisons             | `scripts/benchmarks/prepare.mjs`, `compare.mjs`, `comparison-results.mjs`   |
| Report validation and timing gates               | `scripts/benchmarks/report.mjs`, `policy.json`                              |
| CI selection, overrides, and verdict enforcement | `scripts/benchmarks/ci.mjs`                                                 |
| Release baseline and GitHub publication          | `scripts/benchmarks/baseline.mjs`, `publish.mjs`, `github.mjs`              |
| README markers and table rendering               | `scripts/benchmarks/readme.mjs`                                             |

Run report, gate, and publication tests without GitHub access:

```sh
pnpm exec vitest run --globals scripts/benchmarks.spec.mjs scripts/benchmark-publication.spec.mjs
```

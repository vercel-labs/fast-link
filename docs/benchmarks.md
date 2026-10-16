# Benchmarks

Run benchmarks from the repository root with Node.js 24 and the pinned pnpm
version. Results are controlled Chromium lab measurements. The timing policy
starts report-only. Incorrect behavior, missing samples, and infrastructure
failures fail checks even before timing gates are enabled.

## Reproduce a run

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
results="$(mktemp -d)"
pnpm benchmark --output "$results/full.json"
pnpm benchmark --case core --output "$results/core.json"
pnpm benchmark --case react --output "$results/react.json"
pnpm benchmark --case next --output "$results/next.json"
```

`--output` is required. Choose a results directory outside source checkouts.
CI uses its temporary directory and uploads JSON for 90 days. A failed run
retains available samples and errors; those samples cannot become results.

For a comparison, prepare two isolated checkouts at the desired revisions.
Run from the head checkout:

```sh
pnpm benchmark:compare --base /absolute/path/to/base-checkout --output "$results/comparison"
```

The comparison command installs each checkout's frozen dependencies, forces
production builds, and alternates base/head execution for five batches on one
runner. It copies the head benchmark fixture into the base checkout so both
revisions execute the same workload, including a base that predates benchmarks.
Use disposable checkouts: this copy changes the base fixture. For older fixtures,
the command also adds direct workspace dependencies on core and React bindings
and updates their local workspace lock entries offline. Package source and
external dependency versions stay at their respective revisions. Both checkouts
need compatible public APIs. Dependency updates measure the versions shipped by
each revision; their costs are included in the comparison and versions are
recorded separately.

Use `--case core`, `--case react`, or `--case next` to narrow a comparison during
investigation. A configured gate fails if a required metric is omitted. Full
CI comparisons always run all cases. `--informational` validates work without
applying timing thresholds and is used for release comparisons.

## What the runner measures

All variants run sequentially in production Chromium with a 1280 by 720
viewport. Variant order reverses every batch. Raw JSON records source revisions,
dirty-checkout status, package and framework versions, browser and Node versions,
CPU, memory, operating system, sample units, correctness checks, and elapsed time.
Medians and full minimum-to-maximum ranges use unrounded samples.

| Scenario            | Timed work                                                                                                                                               | Checks                                                                                               |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Core                | Bare DOM handlers versus `createFastLink`; 1,000 dispatched primary mouse presses and their follow-up clicks after 100 warmups, in microseconds per pair | One navigation callback per press, prevented follow-up clicks, no callback after destroy             |
| React interaction   | Plain React anchors versus `useFastLink`, with the same interaction workload                                                                             | Navigation callback count, click suppression, no callback from retained anchors after unmount        |
| Ignored interaction | 1,000 touch pointerdown events after 100 warmups, in microseconds per event                                                                              | No navigation callbacks                                                                              |
| React lifecycle     | One plain anchor versus one bound anchor; mount, update, and unmount                                                                                     | Rendered anchors, changed href and text, updated navigation callback, cleanup                        |
| Next.js lifecycle   | `next/link`, `FastLink`, and a `FastLinkRegion` containing `next/link`; 1, 100, and 1,000 links                                                          | Link count, changed href and text, empty container after unmount                                     |
| Next.js navigation  | Mouse pointerdown capture to destination client layout effect, in milliseconds                                                                           | Committed text, one history entry, one follow-up click, suppression, accepted early-navigation count |

Lifecycle timings wrap synchronous `flushSync` commits, including ref callbacks
and layout effects. Each lifecycle workload runs once before its measured
sample. Updates change every link's href query and label. Next variants share
the same wrapper and anchor structure. These timings include React work and
are not measurements of paint or passive-effect completion.

Synthetic events isolate dispatch costs; they do not measure hardware input
latency. Bare handlers use the same counting callback but omit core's general
eligibility checks. Compare raw variant timings; a subtraction of small noisy
medians is not a regression gate.

Navigation uses real Playwright mouse input with a requested 80 ms hold. Actual
pointerdown-to-pointerup time is recorded separately. Source links stay mounted
while destination content commits so the follow-up click can be checked.
Navigation latency differences include the time `next/link` waits for mouse
release. These lab results do not establish faster JavaScript execution or
typical-user gains.

Each navigation sample uses a new browser context. Prefetch is disabled on
rendered links. Warm cases explicitly call public `router.prefetch`, wait for a
successful route response, and require no route request during navigation. Cold
cases require no route request before the press and a route request during
navigation. This verifies the client router cache; the server and operating
system caches are not cold. A cache mismatch fails the run.

The runner checks that work occurred inside the measured interval. Before
claiming a performance difference, reproduce it, inspect load and profiles,
identify the limiting work, and compare the difference with the sample ranges.
No result here supports a claim about representative users without user data.

## CI and calibration

The `Benchmarks / benchmark` check runs for PRs, pushes to main, and manual
dispatches. Source, fixtures, dependencies, benchmark scripts, and workflow
changes run measurements. Docs-only changes get a successful check without
building or measuring. Keep the existing package-size checks required.

`full-run.json` records elapsed time from the first workflow step through setup,
builds, and measurements. `verdict.json` also records comparison time. Queue time
and artifact upload are outside that interval. Measure hosted run time before
deciding whether to change this implementation; there is no preset time budget.

Before enabling timing gates, manually dispatch the workflow with `calibrate`
selected. This runs ten base/head comparisons of the same revision. To exercise
the command locally:

```sh
pnpm benchmark:compare --base "$PWD" --calibrate --output "$results/calibration"
```

Local noise does not establish hosted-runner noise. Retain the hosted artifact
and review `calibration.json`, the raw samples, and all ten comparisons. Its
proposed absolute budgets are twice the largest observed absolute median
difference. They are proposals, not approved thresholds. Metrics with zero
resolution or unstable ranges stay report-only.

Thresholds live in `scripts/benchmarks/policy.json`. In a separately reviewed
change, add stable core/React metric names to `metrics`, each with an `absolute`
budget in that metric's unit and a link to calibration evidence in the PR. The
maintainer approves stable metrics and budgets above observed noise. The
relative budget starts at a provisional 10%; it is not an industry standard.
Next.js navigation and list timings remain informational.

A raw scenario median must exceed both budgets to request a repeat comparison.
The check fails when the same metric exceeds both budgets again. Valid
comparisons that disagree are inconclusive and pass. Invalid work always fails.
To investigate, download the artifact, compare raw scenarios and environments,
rerun one case, and profile separately from the samples used for publication.

## Intentional regressions

Configure a GitHub environment named `benchmark-override` with required
maintainer reviewers, and then approve a separate policy change enabling
`overridesEnabled`. Keep it disabled until that protection is configured.

Manually dispatch the benchmark workflow on the PR head branch, specify the PR
base revision, and provide `override_reason`. Approval through the protected
environment is required before that run starts. The command also checks that
required reviewers are configured. It records the reason, confirmed measured
cost, units, and original failure in the artifact. Invalid data and infrastructure
failures cannot be overridden. The successful check must belong to the PR's
current head commit. Changing budgets is a separate review, not an override.

## Release publication

After the release workflow's publish job succeeds, the benchmark job records
results in the `benchmark-results` branch. `latest.json` records the latest measured release's full source commit and its
predecessor, so publication retries retain the same comparison. No tag convention or GitHub Release
asset is assumed. The publish allowlist and npm Trusted Publishing rules remain
in effect; an empty allowlist means no release benchmark publication.

The first measured release has no previous-release column value. Later releases
remeasure the previous source commit on the same runner, with the current
benchmark workload. Comparisons validate work but add no cumulative timing gate.
If a previous revision cannot build or has incompatible public APIs,
publication fails for maintainer investigation.
Do not silently substitute a different baseline. A rerun of an older release
fails if the latest measured release is not its ancestor; it cannot move the
results pointer backward.

Raw batches, combined reports, navigation checks, and the verdict are saved under
`results/<source-commit>/` on the results branch. README links point there and
outlive CI artifact retention. The generated table shows units, tested versions,
medians, ranges, and changes from the remeasured previous release. Values use two
significant figures; no per-run timestamp appears in the README.

The release job uses GitHub's signed `createCommitOnBranch` mutation to save
results and update a `runewolf/benchmark-readme-<commit>` branch. It verifies the
returned signature and opens a docs PR. Enable GitHub Actions' permission to
create PRs in repository settings. Only this release job gets contents and PR
write permissions; benchmark PR runs get read access. No npm write token is used.

On the automated docs PR, select **Approve workflows to run** to start its
required checks. GitHub requires this approval for PR workflows triggered by
`GITHUB_TOKEN`; see [triggering a workflow](https://docs.github.com/en/actions/how-tos/writing-workflows/choosing-when-your-workflow-runs/triggering-a-workflow#triggering-a-workflow-from-a-workflow).

`scripts/benchmarks/publish.mjs` owns the README markers and skips a PR when
generated content is unchanged. `renderTable` and `updateReadme` can be exercised
without GitHub through `pnpm exec vitest run --globals scripts/benchmarks.spec.mjs`.
Review release claims against their raw samples before merging the docs PR.

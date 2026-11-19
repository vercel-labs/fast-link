/*
 * Checks whether installed Chrome reports soft navigations for Fast Link
 * integrations as it does for an ordinary Next Link with the same route,
 * content and browser configuration. Requires `pnpm build` and a local Chrome.
 * Exits 0 only when both release integrations pass in every scenario.
 */

/* oxlint-disable no-await-in-loop -- Fresh browsers run one at a time. */
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { loadavg, cpus, platform, release } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';

import { startFixture } from '../fixture-server.mjs';
import {
  DEFAULT_HOLD_MS,
  describeBrowser,
  observeCase,
  SCENARIOS,
  TIMING,
} from './observe.mjs';
import { withTrace } from './trace.mjs';
import {
  BASELINE_VARIANT,
  classifyRun,
  IMMEDIATE_VARIANTS,
  RELEASE_VARIANTS,
  summarizeIntegration,
  summarizeScenario,
} from './verdict.mjs';

const VARIANTS = [BASELINE_VARIANT, ...RELEASE_VARIANTS, ...IMMEDIATE_VARIANTS];
const USAGE = `Usage: pnpm probe:soft-navigation --output FILE [--repetitions N]
  [--hold-ms MS] [--trace-dir DIR] [--headless] [--executable-path PATH] [--chrome-arg ARG]...
  [--scenario ${SCENARIOS.map((scenario) => scenario.id).join('|')}]...`;

/** Validates CLI inputs before starting a production server. */
function readOptions() {
  const { values } = parseArgs({
    options: {
      output: { type: 'string' },
      repetitions: { type: 'string', default: '5' },
      'hold-ms': { type: 'string', default: String(DEFAULT_HOLD_MS) },
      'trace-dir': { type: 'string' },
      headless: { type: 'boolean', default: false },
      'executable-path': { type: 'string' },
      'chrome-arg': { type: 'string', multiple: true, default: [] },
      scenario: { type: 'string', multiple: true },
    },
  });
  const repetitions = Number(values.repetitions);
  const holdMs = Number(values['hold-ms']);
  const scenarios = values.scenario
    ? SCENARIOS.filter((scenario) => values.scenario.includes(scenario.id))
    : SCENARIOS;
  const hasUnknownScenario =
    values.scenario && scenarios.length !== values.scenario.length;
  const isInvalid =
    !values.output ||
    !Number.isInteger(repetitions) ||
    repetitions < 1 ||
    !Number.isFinite(holdMs) ||
    holdMs < 0 ||
    hasUnknownScenario;
  if (isInvalid) throw new Error(USAGE);
  return {
    output: resolve(values.output),
    repetitions,
    holdMs,
    traceDir: values['trace-dir'] && resolve(values['trace-dir']),
    scenarios,
    launch: {
      headless: values.headless,
      args: values['chrome-arg'],
      ...(values['executable-path']
        ? { executablePath: values['executable-path'] }
        : { channel: 'chrome' }),
    },
  };
}

/** Runs every scenario and variant with fresh browsers and writes the report. */
async function main() {
  const options = readOptions();
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const fixture = resolve(root, 'fixtures/next-16');
  const firstSource = `/docs/soft-navigation/source/${options.scenarios[0].id}/${BASELINE_VARIANT}`;
  const server = await startFixture(root, firstSource, fixture);
  try {
    await server.waitUntilReady();
    const browser = await withBrowser(options.launch, (instance) =>
      describeBrowser(instance, `${server.origin}${firstSource}`),
    );
    console.log(
      `Chrome ${browser.version}; soft-navigation entry type: ${browser.softNavigationEntryType}`,
    );
    const runs = [];
    for (let repetition = 1; repetition <= options.repetitions; repetition++) {
      // Rotate variant order so drift and warmup favor no integration.
      const order = rotate(VARIANTS, repetition - 1);
      for (const scenario of options.scenarios) {
        for (const variant of order) {
          runs.push(
            await runCase(
              options,
              server.origin,
              scenario,
              variant,
              repetition,
            ),
          );
        }
      }
    }
    const report = buildReport(options, root, fixture, browser, runs);
    await mkdir(dirname(options.output), { recursive: true });
    await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);
    printSummary(report);
    console.log(`Report: ${options.output}`);
    const hasPassed = RELEASE_VARIANTS.every(
      (variant) => report.integrations[variant] === 'pass',
    );
    if (!hasPassed) process.exitCode = 1;
  } finally {
    await server.close();
  }
}

async function runCase(options, origin, scenario, variant, repetition) {
  const input = { origin, scenario, variant, holdMs: options.holdMs };
  const { observation, trace } = await withBrowser(options.launch, (browser) =>
    observeWithOptionalTrace(browser, options.traceDir, input, repetition),
  );
  const result = classifyRun(observation, {
    variant,
    destinationUrl: observation.destinationUrl,
  });
  console.log(
    `${repetition} ${scenario.id} ${variant}: ${result.detected ? 'detected' : 'not detected'}${result.valid ? '' : ` (invalid: ${result.problems.join(', ')})`}`,
  );
  return {
    scenario: scenario.id,
    variant,
    repetition,
    ...result,
    trace,
    observation,
  };
}

async function observeWithOptionalTrace(browser, traceDir, input, repetition) {
  if (!traceDir) return { observation: await observeCase(browser, input) };
  await mkdir(traceDir, { recursive: true });
  const path = join(
    traceDir,
    `${input.scenario.id}-${input.variant}-${repetition}.json`,
  );
  const { result, trace } = await withTrace(browser, path, () =>
    observeCase(browser, input),
  );
  return { observation: result, trace };
}

async function withBrowser(launch, use) {
  const browser = await chromium.launch(launch);
  try {
    return await use(browser);
  } finally {
    await browser.close();
  }
}

function buildReport(options, root, fixture, browser, runs) {
  const scenarios = Object.fromEntries(
    options.scenarios.map((scenario) => [
      scenario.id,
      summarizeScenario(runs.filter((run) => run.scenario === scenario.id)),
    ]),
  );
  const summaries = Object.values(scenarios);
  const require = createRequire(resolve(fixture, 'package.json'));
  const git = (...args) =>
    execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
  return {
    createdAt: new Date().toISOString(),
    source: {
      revision: git('rev-parse', 'HEAD'),
      dirtyPaths: git('status', '--porcelain').split('\n').filter(Boolean),
    },
    versions: Object.fromEntries(
      ['next', 'react', 'react-dom', 'playwright'].map((name) => [
        name,
        (name === 'playwright' ? createRequire(import.meta.url) : require)(
          `${name}/package.json`,
        ).version,
      ]),
    ),
    host: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      cores: cpus().length,
      loadAverage: loadavg(),
      node: process.version,
    },
    launch: options.launch,
    browser,
    timing: { holdMs: options.holdMs, ...TIMING },
    repetitions: options.repetitions,
    integrations: Object.fromEntries(
      RELEASE_VARIANTS.map((variant) => [
        variant,
        summarizeIntegration(summaries, variant),
      ]),
    ),
    scenarios,
    runs,
  };
}

function printSummary(report) {
  for (const [id, summary] of Object.entries(report.scenarios)) {
    const { baseline } = summary;
    console.log(
      `\n${id}: baseline detected ${baseline.detected}/${baseline.runs} (valid ${baseline.valid})`,
    );
    for (const [variant, result] of Object.entries({
      ...summary.release,
      ...summary.immediate,
    })) {
      console.log(
        `  ${variant}: ${result.verdict}, detected ${result.detected}/${result.runs} (valid ${result.valid})`,
      );
      for (const problem of result.problems) console.log(`    ${problem}`);
    }
  }
  console.log(`\nRelease verdicts: ${JSON.stringify(report.integrations)}`);
}

function rotate(values, offset) {
  const start = offset % values.length;
  return [...values.slice(start), ...values.slice(0, start)];
}

await main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});

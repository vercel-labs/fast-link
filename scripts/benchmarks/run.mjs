/* oxlint-disable no-await-in-loop -- Measurements run sequentially to avoid contention. */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';

import { createMeasurements } from './measure.mjs';
import { scenarioNames, summarize, validateReport } from './report.mjs';
import { startFixture } from './server.mjs';
import { workload } from './workload.mjs';

/** Validates CLI inputs before starting a production server. */
function readOptions() {
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: process.cwd() },
      output: { type: 'string' },
      case: { type: 'string', default: 'all' },
      batch: { type: 'string' },
    },
  });
  if (!values.output || !['all', 'core', 'react', 'next'].includes(values.case))
    throw new Error(
      'Usage: pnpm benchmark --output FILE [--case core|react|next]',
    );
  return {
    ...values,
    root: resolve(values.root),
    output: resolve(values.output),
  };
}

/** Captures source identity, tested versions, environment, and measurement conditions. */
async function createReport(root, selected) {
  const manifest = async (path) =>
    JSON.parse(await readFile(resolve(root, path), 'utf8'));
  const fixtureManifest = await manifest('fixtures/next-16/package.json');
  return {
    schema: 1,
    revision: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    dirty:
      execFileSync('git', ['status', '--porcelain'], {
        cwd: root,
        encoding: 'utf8',
      }).trim().length > 0,
    versions: {
      next: fixtureManifest.dependencies.next,
      react: fixtureManifest.dependencies.react,
      reactDom: fixtureManifest.dependencies['react-dom'],
      core: (await manifest('packages/core/package.json')).version,
      bindings: (await manifest('packages/react/package.json')).version,
      adapter: (await manifest('packages/next/package.json')).version,
    },
    environment: {
      platform: platform(),
      release: release(),
      cpu: cpus()[0]?.model,
      cores: cpus().length,
      memoryBytes: totalmem(),
      node: process.version,
      playwright: createRequire(import.meta.url)('playwright/package.json')
        .version,
    },
    conditions: {
      ...workload,
      case: selected,
    },
    metrics: {},
    errors: [],
  };
}

/** Rejects missing scenarios and summarizes complete reports. */
function completeReport(result, values) {
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  if (
    JSON.stringify(Object.keys(result.metrics).toSorted()) !==
    JSON.stringify(
      scenarioNames(values.case, result.conditions.listSizes).toSorted(),
    )
  )
    throw new Error('Benchmark scenarios are incomplete');
  if (values.batch === undefined)
    for (const metric of Object.values(result.metrics))
      Object.assign(metric, summarize(metric.samples));
  if (values.batch === undefined) validateReport(result);
}

/** Runs measurements and retains partial results when work fails. */
async function main() {
  const started = performance.now();
  const values = readOptions();
  const { root, output } = values;
  const result = await createReport(root, values.case);
  let browser;
  let server;

  try {
    server = await startFixture(root);
    await server.waitUntilReady();
    browser = await chromium.launch();
    result.environment.browser = browser.version();
    const measurements = createMeasurements(browser, server.origin, result);
    const batches =
      values.batch === undefined
        ? Array.from({ length: result.conditions.batches }, (_, batch) => batch)
        : [Number(values.batch)];
    if (batches.some((batch) => !Number.isInteger(batch) || batch < 0))
      throw new Error('Invalid batch');
    for (const batch of batches) {
      await measurements.measureBatch(batch);
    }
    completeReport(result, values);
  } catch (error) {
    result.errors.push(error.stack);
    process.exitCode = 1;
  } finally {
    await browser?.close();
    await server?.close();
    result.elapsedMs = performance.now() - started;
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
    console.log(
      `Benchmark ${process.exitCode ? 'failed' : 'completed'}: ${output}`,
    );
    if (result.errors.length) console.error(result.errors.join('\n'));
  }
}

await main();

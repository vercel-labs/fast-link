/* oxlint-disable no-await-in-loop -- Keep startup and measurements sequential. */
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';

import { chromium } from 'playwright';

import { startFixture } from '../fixture-server.mjs';
import { createMeasurements } from './measure.mjs';
import { scenarioNames, summarize, validateReport } from './report.mjs';
import { workload } from './workload.mjs';

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
function completeReport(result, batch) {
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  if (
    JSON.stringify(Object.keys(result.metrics).toSorted()) !==
    JSON.stringify(
      scenarioNames(
        result.conditions.case,
        result.conditions.listSizes,
      ).toSorted(),
    )
  )
    throw new Error('Benchmark scenarios are incomplete');
  if (batch === undefined)
    for (const metric of Object.values(result.metrics))
      Object.assign(metric, summarize(metric.samples));
  if (batch === undefined) validateReport(result);
}

/**
 * Shares Chromium and one production server per checkout across sequential batches.
 * Each measurement keeps fresh browser contexts. The caller must close the session.
 */
export function createBenchmarkSession() {
  const servers = new Map();
  let browser;

  /** Attempts every teardown even if another resource fails to close. */
  async function close() {
    const results = await Promise.allSettled([
      browser?.close(),
      ...Array.from(servers.values(), (server) => server.close()),
    ]);
    const errors = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason);
    if (errors.length)
      throw new AggregateError(errors, 'Benchmark cleanup failed');
  }

  /** Starts each checkout once, inside the report's failure-capture boundary. */
  async function prepare(root) {
    let server = servers.get(root);
    if (!server) {
      server = await startFixture(root, '/docs/benchmark');
      servers.set(root, server);
      await server.waitUntilReady();
    }
    browser ??= await chromium.launch();
    return server.origin;
  }

  /** Writes one batch or a full run; failed work is saved before rejection. */
  async function measure({ root, output, selected, batch }) {
    const started = performance.now();
    const result = await createReport(root, selected);

    try {
      const origin = await prepare(root);
      result.environment.browser = browser.version();
      const batches =
        batch === undefined
          ? Array.from(
              { length: result.conditions.batches },
              (_, index) => index,
            )
          : [batch];
      if (batches.some((index) => !Number.isInteger(index) || index < 0))
        throw new Error('Invalid batch');
      const measurements = createMeasurements(browser, origin, result);
      for (const index of batches) await measurements.measureBatch(index);
      completeReport(result, batch);
    } catch (error) {
      result.errors.push(error.stack);
    } finally {
      result.elapsedMs = performance.now() - started;
      await mkdir(dirname(output), { recursive: true });
      await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
    }

    if (result.errors.length)
      throw new Error(
        `Benchmark failed: ${output}\n${result.errors.join('\n')}`,
      );
    console.log(`Benchmark completed: ${output}`);
    return result;
  }

  return { measure, close };
}

/* oxlint-disable no-await-in-loop -- Measurements run sequentially to avoid contention. */
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { cpus, platform, release, totalmem } from 'node:os';
import { dirname, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { parseArgs } from 'node:util';

import { chromium } from 'playwright';

import { scenarioNames, summarize, validateReport } from './report.mjs';

const started = performance.now();
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
const root = resolve(values.root);
const output = resolve(values.output);
const fixture = resolve(root, 'fixtures/next-16');
const manifest = async (path) =>
  JSON.parse(await readFile(resolve(root, path), 'utf8'));
const fixtureManifest = await manifest('fixtures/next-16/package.json');
const result = {
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
    batches: 5,
    interactions: 1000,
    warmup: 100,
    holdMs: 80,
    listSizes: [1, 100, 1000],
    case: values.case,
  },
  metrics: {},
  errors: [],
};
const socket = createServer();
socket.listen(0, '127.0.0.1');
await once(socket, 'listening');
const port = socket.address().port;
await new Promise((done) => socket.close(done));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(
  process.execPath,
  [
    resolve(fixture, 'node_modules/next/dist/bin/next'),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  { cwd: fixture, stdio: ['ignore', 'pipe', 'pipe'] },
);
let logs = '';
server.stdout.on('data', (data) => {
  logs += data;
});
server.stderr.on('data', (data) => {
  logs += data;
});
let browser;

function saveMetric(name, metric, batch) {
  if (
    !Number.isFinite(metric.value) ||
    metric.value < 0 ||
    metric.correct !== true
  )
    throw new Error(`Invalid measured work: ${name}`);
  const entry = (result.metrics[name] ??= {
    unit: metric.unit,
    samples: [],
    checks: [],
    batches: [],
  });
  entry.samples.push(metric.value);
  entry.checks.push(metric.correct);
  entry.batches.push(batch);
}

async function openPage() {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => result.errors.push(error.message));
  await page.goto(`${origin}/docs/benchmark`);
  await page.waitForFunction(() => Boolean(window.benchmark));
  return { context, page };
}

function navigationCorrect(observed, early, historyBefore) {
  return (
    observed.text === 'Benchmark destination' &&
    observed.destination.text === observed.text &&
    observed.start > 0 &&
    observed.release >= observed.start &&
    observed.destination.committed >= observed.start &&
    observed.clicks === 1 &&
    observed.prevented === 1 &&
    observed.accepted === (early ? 1 : 0) &&
    observed.suppressed === (early ? 1 : 0) &&
    observed.history === historyBefore + 1
  );
}

async function navigation(variant, cache, batch) {
  const { context, page } = await openPage();
  try {
    const routeRequests = [];
    page.on('request', (request) => {
      if (
        new URL(request.url()).pathname === '/docs/benchmark/target' &&
        request.headers().rsc === '1'
      )
        routeRequests.push(request);
    });
    await page.evaluate((v) => window.benchmark.navigation(v), variant);
    if (cache === 'warm') {
      const prefetched = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/docs/benchmark/target' &&
          response.request().headers().rsc === '1' &&
          response.ok(),
      );
      await page.evaluate(() => window.benchmark.prefetch());
      await (await prefetched).finished();
    }
    await page.waitForLoadState('networkidle');
    const beforeRequests = routeRequests.length;
    if (
      (cache === 'cold' && beforeRequests !== 0) ||
      (cache === 'warm' && beforeRequests === 0)
    )
      throw new Error(`Unverified ${cache} cache state`);
    const historyBefore = await page.evaluate(() => history.length);
    const anchor = page.locator('[data-benchmark-area] a');
    const box = await anchor.boundingBox();
    if (!box) throw new Error('Missing navigation anchor');
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(80);
    await page.mouse.up();
    await page.locator('[data-benchmark-destination]').waitFor();
    await page.waitForFunction(() => Boolean(window.benchmarkDestination));
    await page.waitForLoadState('networkidle');
    const observed = await page.evaluate(() => ({
      ...window.benchmark.events,
      destination: window.benchmarkDestination,
      history: history.length,
      text: document.querySelector('[data-benchmark-destination]')?.textContent,
    }));
    const early = variant !== 'next';
    const correct = navigationCorrect(observed, early, historyBefore);

    if (
      (cache === 'cold' && routeRequests.length === beforeRequests) ||
      (cache === 'warm' && routeRequests.length !== beforeRequests)
    )
      throw new Error(`Navigation did not use verified ${cache} router cache`);
    saveMetric(
      `next.${variant}.${cache}.navigation`,
      {
        value: observed.destination.committed - observed.start,
        unit: 'ms',
        correct,
      },
      batch,
    );
    saveMetric(
      `next.${variant}.${cache}.pressDuration`,
      { value: observed.release - observed.start, unit: 'ms', correct },
      batch,
    );
    result.navigationChecks ??= [];
    result.navigationChecks.push({
      variant,
      cache,
      batch,
      beforeRequests,
      navigationRequests: routeRequests.length - beforeRequests,
      ...observed,
    });
  } finally {
    await context.close();
  }
}

try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`Server exited: ${logs}`);
    try {
      ready = (await fetch(`${origin}/docs/benchmark`)).ok;
    } catch {
      /* Wait for the production server. */
    }
    if (ready) break;
    await delay(250);
  }
  if (!ready) throw new Error(`Server startup timed out: ${logs}`);
  browser = await chromium.launch();
  result.environment.browser = browser.version();
  const batches =
    values.batch === undefined ? [0, 1, 2, 3, 4] : [Number(values.batch)];
  if (batches.some((batch) => !Number.isInteger(batch) || batch < 0))
    throw new Error('Invalid batch');
  for (const batch of batches) {
    const { context, page } = await openPage();
    try {
      for (const group of ['core', 'react', 'next']) {
        if (values.case !== 'all' && values.case !== group) continue;
        const variants =
          group === 'core'
            ? ['bare', 'core']
            : group === 'react'
              ? ['plain', 'react']
              : ['next', 'fast', 'region'];
        if (batch % 2) variants.reverse();
        for (const variant of variants) {
          if (group !== 'next') {
            const metrics = await page.evaluate(
              (input) =>
                input.group === 'core'
                  ? window.benchmark.micro(input.variant)
                  : window.benchmark.interaction(input.variant),
              { group, variant },
            );
            for (const [name, metric] of Object.entries(metrics))
              saveMetric(`${group}.${variant}.${name}`, metric, batch);
          }
          if (group === 'core') continue;
          for (const count of group === 'next' ? [1, 100, 1000] : [1]) {
            // Warm the same lifecycle workload before timing it.
            await page.evaluate(
              (input) => window.benchmark.lifecycle(input.variant, input.count),
              { variant, count },
            );
            const metrics = await page.evaluate(
              (input) => window.benchmark.lifecycle(input.variant, input.count),
              { variant, count },
            );
            for (const [name, metric] of Object.entries(metrics))
              saveMetric(`${group}.${variant}.${count}.${name}`, metric, batch);
          }
        }
      }
    } finally {
      await context.close();
    }
    if (values.case === 'all' || values.case === 'next') {
      const variants =
        batch % 2 ? ['region', 'fast', 'next'] : ['next', 'fast', 'region'];
      for (const variant of variants)
        for (const cache of ['warm', 'cold'])
          await navigation(variant, cache, batch);
    }
  }
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  if (
    JSON.stringify(Object.keys(result.metrics).toSorted()) !==
    JSON.stringify(scenarioNames(values.case).toSorted())
  )
    throw new Error('Benchmark scenarios are incomplete');
  if (values.batch === undefined)
    for (const metric of Object.values(result.metrics))
      Object.assign(metric, summarize(metric.samples));
  if (values.batch === undefined) validateReport(result);
} catch (error) {
  result.errors.push(error.stack);
  process.exitCode = 1;
} finally {
  await browser?.close();
  if (server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill('SIGTERM');
    await exited;
  }
  result.elapsedMs = performance.now() - started;
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`);
  console.log(
    `Benchmark ${process.exitCode ? 'failed' : 'completed'}: ${output}`,
  );
  if (result.errors.length) console.error(result.errors.join('\n'));
}

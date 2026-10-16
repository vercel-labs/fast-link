/* oxlint-disable no-await-in-loop -- Alternate revisions on one runner without overlapping work. */
import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { parseDocument } from 'yaml';

import { evaluateGate, summarize, validateReport } from './report.mjs';

const started = performance.now();
const { values } = parseArgs({
  options: {
    base: { type: 'string' },
    head: { type: 'string', default: process.cwd() },
    output: { type: 'string' },
    case: { type: 'string', default: 'all' },
    calibrate: { type: 'boolean', default: false },
    informational: { type: 'boolean', default: false },
  },
});
if (!values.base || !values.output)
  throw new Error(
    'Usage: pnpm benchmark:compare --base CHECKOUT --output DIRECTORY [--calibrate]',
  );
const head = resolve(values.head);
const base = resolve(values.base);
const output = resolve(values.output);
const runner = fileURLToPath(new URL('./run.mjs', import.meta.url));
const policy = JSON.parse(
  await readFile(new URL('./policy.json', import.meta.url), 'utf8'),
);
await mkdir(output, { recursive: true });

async function run(command, args, cwd) {
  await new Promise((done, reject) => {
    const process = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: { ...globalThis.process.env, NEXT_TELEMETRY_DISABLED: '1' },
    });
    process.on('error', reject);
    process.on('exit', (code) =>
      code === 0 ? done() : reject(new Error(`${command} exited ${code}`)),
    );
  });
}

async function comparison(index) {
  const collected = { base: [], head: [] };
  for (let batch = 0; batch < 5; batch++) {
    const sides = (batch + index) % 2 ? ['head', 'base'] : ['base', 'head'];
    for (const side of sides) {
      const path = resolve(output, `${index}-${batch}-${side}.json`);
      await run(
        process.execPath,
        [
          runner,
          '--root',
          side === 'base' ? base : head,
          '--output',
          path,
          '--case',
          values.case,
          '--batch',
          String(batch),
        ],
        head,
      );
      const report = JSON.parse(await readFile(path, 'utf8'));
      if (report.errors.length) throw new Error(`Failed work in ${path}`);
      collected[side].push(report);
    }
  }
  const reports = {};
  for (const side of ['base', 'head']) {
    const [first, ...rest] = collected[side];
    const combined = structuredClone(first);
    combined.navigationChecks = collected[side].flatMap(
      (report) => report.navigationChecks ?? [],
    );
    combined.elapsedMs = collected[side].reduce(
      (sum, report) => sum + report.elapsedMs,
      0,
    );
    for (const report of rest) {
      if (
        JSON.stringify(Object.keys(report.metrics).toSorted()) !==
        JSON.stringify(Object.keys(first.metrics).toSorted())
      )
        throw new Error('Scenario set changed between batches');
      for (const [name, metric] of Object.entries(report.metrics)) {
        combined.metrics[name].samples.push(...metric.samples);
        combined.metrics[name].checks.push(...metric.checks);
        combined.metrics[name].batches.push(...metric.batches);
      }
    }
    for (const metric of Object.values(combined.metrics))
      Object.assign(metric, summarize(metric.samples));
    validateReport(combined);
    reports[side] = combined;
    await writeFile(
      resolve(output, `${index}-${side}.json`),
      `${JSON.stringify(combined, null, 2)}\n`,
    );
  }
  const validity = evaluateGate(reports.base, reports.head, {
    ...policy,
    metrics: {},
  });
  if (validity.status === 'fail') throw new Error(validity.error);
  return reports;
}

const comparisons = [];
let verdict;
try {
  // Apply one benchmark workload to both revisions, including revisions predating it.
  if (base !== head)
    await cp(
      resolve(head, 'fixtures/next-16/app/benchmark'),
      resolve(base, 'fixtures/next-16/app/benchmark'),
      { recursive: true, force: true },
    );
  for (const directory of new Set([base, head])) {
    const fixturePath = resolve(directory, 'fixtures/next-16/package.json');
    const fixtureManifest = JSON.parse(await readFile(fixturePath, 'utf8'));
    if (
      !fixtureManifest.dependencies['@fast-link/core'] ||
      !fixtureManifest.dependencies['@fast-link/react']
    ) {
      fixtureManifest.dependencies['@fast-link/core'] = 'workspace:^';
      fixtureManifest.dependencies['@fast-link/react'] = 'workspace:^';
      await writeFile(
        fixturePath,
        `${JSON.stringify(fixtureManifest, null, 2)}\n`,
      );
      const lockPath = resolve(directory, 'pnpm-lock.yaml');
      const lock = parseDocument(await readFile(lockPath, 'utf8'));
      if (lock.get('lockfileVersion') !== '9.0')
        throw new Error('Unsupported baseline lockfile format');
      for (const name of ['core', 'react'])
        lock.setIn(
          [
            'importers',
            'fixtures/next-16',
            'dependencies',
            `@fast-link/${name}`,
          ],
          { specifier: 'workspace:^', version: `link:../../packages/${name}` },
        );
      await writeFile(lockPath, lock.toString());
    }
    await run('pnpm', ['install', '--frozen-lockfile'], directory);
    await run('pnpm', ['exec', 'turbo', 'run', 'build', '--force'], directory);
  }
  const count = values.calibrate ? policy.calibrationComparisons : 1;
  for (let index = 0; index < count; index++)
    comparisons.push(await comparison(index));
  const first = comparisons[0];
  const effectivePolicy =
    values.informational || values.calibrate
      ? { ...policy, metrics: {} }
      : policy;
  verdict = evaluateGate(first.base, first.head, effectivePolicy);
  if (verdict.status === 'repeat') {
    const confirmation = await comparison(count);
    comparisons.push(confirmation);
    verdict = evaluateGate(
      first.base,
      first.head,
      effectivePolicy,
      confirmation,
    );
  }
  if (values.calibrate) {
    if (comparisons.some((pair) => pair.base.revision !== pair.head.revision))
      throw new Error(
        'Calibration requires unchanged code (the same revision)',
      );
    const noise = {};
    for (const name of Object.keys(first.head.metrics).filter((key) =>
      /^(core|react)\./.test(key),
    )) {
      const differences = comparisons.map((pair) =>
        Math.abs(
          summarize(pair.head.metrics[name].samples).median -
            summarize(pair.base.metrics[name].samples).median,
        ),
      );
      noise[name] = {
        maxAbsoluteDifference: Math.max(...differences),
        proposedAbsoluteBudget: Math.max(...differences) * 2,
        unit: first.head.metrics[name].unit,
      };
    }
    await writeFile(
      resolve(output, 'calibration.json'),
      `${JSON.stringify({ comparisons: comparisons.length, noise, approvalRequired: true }, null, 2)}\n`,
    );
  }
} catch (error) {
  verdict = { status: 'fail', error: error.stack };
} finally {
  const summary = {
    ...verdict,
    elapsedMs: performance.now() - started,
    comparisons: comparisons.length,
    reportOnly: Object.keys(policy.metrics).length === 0,
  };
  await writeFile(
    resolve(output, 'verdict.json'),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  console.log(JSON.stringify(summary, null, 2));
  if (verdict.status === 'fail') process.exitCode = 1;
}

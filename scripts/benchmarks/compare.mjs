/* oxlint-disable no-await-in-loop -- Alternate revisions without overlapping work. */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { combineBatches, summarizeCalibration } from './comparison-results.mjs';
import { prepareCheckouts } from './prepare.mjs';
import { runCommand } from './process.mjs';
import { evaluateGate } from './report.mjs';
import { workload } from './workload.mjs';

const runner = fileURLToPath(new URL('./run.mjs', import.meta.url));

/** Resolves checkout and output paths before any build or measurement starts. */
function readOptions() {
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

  if (!values.base || !values.output) {
    throw new Error(
      'Usage: pnpm benchmark:compare --base CHECKOUT --output DIRECTORY [--calibrate]',
    );
  }

  return {
    ...values,
    base: resolve(values.base),
    head: resolve(values.head),
    output: resolve(values.output),
  };
}

/** Runs one revision's batch and retains its raw JSON, including failed work. */
async function measureBatch(options, index, batch, side) {
  const path = resolve(options.output, `${index}-${batch}-${side}.json`);
  await runCommand(
    process.execPath,
    [
      runner,
      '--root',
      options[side],
      '--output',
      path,
      '--case',
      options.case,
      '--batch',
      String(batch),
    ],
    options.head,
  );

  const report = JSON.parse(await readFile(path, 'utf8'));
  if (report.errors.length) throw new Error(`Failed work in ${path}`);
  return report;
}

/** Alternates base/head batches, then saves a complete report for each side. */
async function measureComparison(options, index, policy) {
  const collected = { base: [], head: [] };

  for (let batch = 0; batch < workload.batches; batch++) {
    const sides = (batch + index) % 2 ? ['head', 'base'] : ['base', 'head'];
    for (const side of sides) {
      collected[side].push(await measureBatch(options, index, batch, side));
    }
  }

  const reports = {};
  for (const side of ['base', 'head']) {
    reports[side] = combineBatches(collected[side]);
    await writeJson(
      resolve(options.output, `${index}-${side}.json`),
      reports[side],
    );
  }

  const validity = evaluateGate(reports.base, reports.head, {
    ...policy,
    metrics: {},
  });
  if (validity.status === 'fail') throw new Error(validity.error);
  return reports;
}

/** Repeats only a suspected timing regression; invalid work never requests a repeat. */
async function evaluateComparisons(options, comparisons, policy) {
  const first = comparisons[0];
  const verdict = evaluateGate(first.base, first.head, policy);
  if (verdict.status !== 'repeat') return verdict;

  const confirmation = await measureComparison(
    options,
    comparisons.length,
    policy,
  );
  comparisons.push(confirmation);
  return evaluateGate(first.base, first.head, policy, confirmation);
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Coordinates preparation, measurements, and a verdict retained on failure. */
async function main() {
  const started = performance.now();
  const options = readOptions();
  const policy = JSON.parse(
    await readFile(new URL('./policy.json', import.meta.url), 'utf8'),
  );
  const comparisons = [];
  let verdict;

  await mkdir(options.output, { recursive: true });

  try {
    await prepareCheckouts(options.base, options.head);

    const count = options.calibrate ? policy.calibrationComparisons : 1;
    for (let index = 0; index < count; index++) {
      comparisons.push(await measureComparison(options, index, policy));
    }

    const effectivePolicy =
      options.informational || options.calibrate
        ? { ...policy, metrics: {} }
        : policy;
    verdict = await evaluateComparisons(options, comparisons, effectivePolicy);

    if (options.calibrate) {
      await writeJson(
        resolve(options.output, 'calibration.json'),
        summarizeCalibration(comparisons),
      );
    }
  } catch (error) {
    verdict = { status: 'fail', error: error.stack };
  }

  const summary = {
    ...verdict,
    elapsedMs: performance.now() - started,
    comparisons: comparisons.length,
    reportOnly: Object.keys(policy.metrics).length === 0,
  };
  await writeJson(resolve(options.output, 'verdict.json'), summary);
  console.log(JSON.stringify(summary, null, 2));
  if (verdict.status === 'fail') process.exitCode = 1;
}

await main();

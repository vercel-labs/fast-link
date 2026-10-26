/* oxlint-disable no-await-in-loop -- Alternate revisions without overlapping work. */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { combineBatches } from './comparison-results.mjs';
import { prepareCheckouts } from './prepare.mjs';
import { evaluateComparison } from './report.mjs';
import { createBenchmarkSession } from './session.mjs';
import { workload } from './workload.mjs';

/** Resolves checkout and output paths before any build or measurement starts. */
function readOptions() {
  const { values } = parseArgs({
    options: {
      base: { type: 'string' },
      head: { type: 'string', default: process.cwd() },
      output: { type: 'string' },
      case: { type: 'string', default: 'all' },
    },
  });

  if (!values.base || !values.output) {
    throw new Error(
      'Usage: pnpm benchmark:compare --base CHECKOUT --output DIRECTORY',
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
async function measureBatch(session, options, batch, side) {
  const path = resolve(options.output, `batch-${batch}-${side}.json`);
  return session.measure({
    root: options[side],
    output: path,
    selected: options.case,
    batch,
  });
}

/** Alternates base/head batches, then saves a complete report for each side. */
async function measureComparison(session, options) {
  const collected = { base: [], head: [] };

  for (let batch = 0; batch < workload.batches; batch++) {
    const sides = batch % 2 ? ['head', 'base'] : ['base', 'head'];
    for (const side of sides) {
      collected[side].push(await measureBatch(session, options, batch, side));
    }
  }

  const reports = {};
  for (const side of ['base', 'head']) {
    reports[side] = combineBatches(collected[side]);
    await writeJson(resolve(options.output, `${side}.json`), reports[side]);
  }

  return reports;
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

/** Coordinates preparation, measurements, and a verdict retained on failure. */
async function main() {
  const started = performance.now();
  const options = readOptions();
  let comparisons = 0;
  let verdict;
  let session;

  await mkdir(options.output, { recursive: true });

  try {
    await prepareCheckouts(options.base, options.head);
    session = createBenchmarkSession();

    const reports = await measureComparison(session, options);
    comparisons = 1;
    verdict = evaluateComparison(reports.base, reports.head);
  } catch (error) {
    verdict = { status: 'fail', error: error.stack };
  } finally {
    try {
      await session?.close();
    } catch (error) {
      verdict = { status: 'fail', error: error.stack };
    }
  }

  const summary = {
    ...verdict,
    elapsedMs: performance.now() - started,
    comparisons,
  };
  await writeJson(resolve(options.output, 'verdict.json'), summary);
  console.log(JSON.stringify(summary, null, 2));
  if (verdict.status === 'fail') process.exitCode = 1;
}

await main();

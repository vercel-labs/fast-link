import { execFileSync } from 'node:child_process';
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { githubRequest } from './github.mjs';
import { runCommand } from './process.mjs';

/** Selects inputs that can change the benchmark workload or measured implementation. */
export function relevantChanges(paths) {
  return paths.some((path) =>
    /^(packages\/|fixtures\/|scripts\/|\.github\/workflows\/|package\.json$|pnpm-lock\.yaml$|pnpm-workspace\.yaml$|turbo\.json$|tsconfig)/.test(
      path,
    ),
  );
}

/** Applies an approved override only to a confirmed timing failure. */
export function applyOverride(verdict, { enabled, reason, reviewers }) {
  if (
    !enabled ||
    !reason?.trim() ||
    !Array.isArray(reviewers) ||
    !reviewers.length
  )
    throw new Error(
      'Override requires enabled policy, a reason, and protected environment reviewers',
    );
  if (verdict.status !== 'fail' || verdict.error || !verdict.confirmed?.length)
    throw new Error('Only a confirmed timing regression can be overridden');
  return {
    ...verdict,
    status: 'override',
    override: { reason: reason.trim(), measuredCost: verdict.confirmed },
  };
}

/** Resolves an immutable baseline and marks manual runs as relevant. */
async function selectInputs() {
  const requested =
    process.env.CALIBRATE === 'true'
      ? 'HEAD'
      : process.env.REQUESTED_BASE || process.env.EVENT_BASE || 'HEAD^';
  const base = execFileSync(
    'git',
    ['rev-parse', '--verify', `${requested}^{commit}`],
    {
      encoding: 'utf8',
    },
  ).trim();
  const relevant = process.env.MANUAL === 'true' || changedInputs(base);

  await appendFile(
    process.env.GITHUB_OUTPUT,
    `base=${base}\nrelevant=${relevant}\n`,
  );
}

/** Inspects the full base-to-head diff, including deleted input files. */
function changedInputs(base) {
  const paths = execFileSync('git', ['diff', '--name-only', base, 'HEAD'], {
    encoding: 'utf8',
  })
    .trim()
    .split('\n');
  return relevantChanges(paths);
}

/** Applies the protected environment's approval to an existing confirmed failure. */
async function overrideResult(path) {
  const verdict = JSON.parse(await readFile(path, 'utf8'));
  const policy = JSON.parse(
    await readFile(new URL('./policy.json', import.meta.url), 'utf8'),
  );
  const environment = githubRequest(
    `repos/${process.env.GITHUB_REPOSITORY}/environments/benchmark-override`,
  );
  const reviewers = environment.protection_rules.find(
    (rule) => rule.type === 'required_reviewers',
  )?.reviewers;
  const overridden = applyOverride(verdict, {
    enabled: policy.overridesEnabled,
    reason: process.env.BENCHMARK_OVERRIDE_REASON,
    reviewers,
  });

  await writeFile(path, `${JSON.stringify(overridden, null, 2)}\n`);
}

/** Includes setup and build time, ending before artifact upload. */
async function recordElapsed(directory) {
  const result = {
    elapsedSeconds: Date.now() / 1000 - Number(process.env.BENCHMARK_STARTED),
    relevant: process.env.RELEVANT,
  };
  await mkdir(directory, { recursive: true });
  await writeFile(
    resolve(directory, 'full-run.json'),
    JSON.stringify(result, null, 2),
  );
  await appendFile(
    process.env.GITHUB_STEP_SUMMARY,
    `Benchmark setup, builds, and measurements: ${result.elapsedSeconds.toFixed(1)} seconds.\n`,
  );
}

/** Fails closed when the verdict is missing, invalid, or still requests a repeat. */
async function enforceResult(directory) {
  const verdict = JSON.parse(
    await readFile(resolve(directory, 'verdict.json'), 'utf8'),
  );
  console.log(verdict);
  if (!['pass', 'inconclusive', 'override'].includes(verdict.status))
    process.exitCode = 1;
}

/** Runs the same comparison entry point locally and on hosted runners. */
async function measureComparison(directory) {
  const args = [
    fileURLToPath(new URL('./compare.mjs', import.meta.url)),
    '--base',
    '../base',
    '--output',
    directory,
  ];
  if (process.env.CALIBRATE === 'true') args.push('--calibrate');
  await runCommand(process.execPath, args, process.cwd());
}

async function main() {
  const [command, argument] = process.argv.slice(2);
  const directory = resolve(
    process.env.RUNNER_TEMP ?? '.',
    'benchmark-results',
  );

  switch (command) {
    case 'select':
      return selectInputs();
    case 'relevant':
      return console.log(`relevant=${changedInputs(argument)}`);
    case 'compare':
      return measureComparison(directory);
    case 'override':
      return overrideResult(argument);
    case 'elapsed':
      return recordElapsed(directory);
    case 'enforce':
      return enforceResult(directory);
    default:
      throw new Error(
        'Expected select, relevant, compare, override, elapsed, or enforce',
      );
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();

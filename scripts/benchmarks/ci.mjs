import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

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

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === 'relevant') {
    const paths = execFileSync(
      'git',
      ['diff', '--name-only', process.argv[3], 'HEAD'],
      { encoding: 'utf8' },
    )
      .trim()
      .split('\n');
    console.log(`relevant=${relevantChanges(paths)}`);
  } else if (process.argv[2] === 'override') {
    const path = process.argv[3];
    const verdict = JSON.parse(await readFile(path, 'utf8'));
    const policy = JSON.parse(
      await readFile(new URL('./policy.json', import.meta.url), 'utf8'),
    );
    const environment = JSON.parse(
      execFileSync(
        'gh',
        [
          'api',
          `repos/${process.env.GITHUB_REPOSITORY}/environments/benchmark-override`,
        ],
        { encoding: 'utf8' },
      ),
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
  } else throw new Error('Expected relevant or override');
}

import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyOverride, relevantChanges } from './benchmarks/ci.mjs';
import {
  combineBatches,
  summarizeCalibration,
} from './benchmarks/comparison-results.mjs';
import { updateReadme, renderTable } from './benchmarks/readme.mjs';
import { evaluateGate, summarize } from './benchmarks/report.mjs';

const metric = (value) => ({
  unit: 'us/op',
  samples: [value, value, value, value, value],
  checks: [true, true, true, true, true],
});
const report = (value) => ({
  schema: 1,
  revision: 'a'.repeat(40),
  versions: { next: '16.3.6' },
  environment: { browser: 'Chromium' },
  metrics: { 'core.fast.accepted': metric(value) },
});
const policy = {
  relative: 0.1,
  metrics: { 'core.fast.accepted': { absolute: 2 } },
};

describe('benchmark results', () => {
  it('updates only the generated README region and skips identical output', () => {
    const readme =
      'Before\n<!-- benchmarks:start -->\nOld\n<!-- benchmarks:end -->\nAfter\n';
    const updated = updateReadme(readme, 'Verified table');
    expect(updated).toBe(
      'Before\n<!-- benchmarks:start -->\nVerified table\n<!-- benchmarks:end -->\nAfter\n',
    );
    expect(updateReadme(updated, 'Verified table')).toBe(updated);
    expect(() => updateReadme('No markers', 'Table')).toThrow();
  });

  it('classifies implementation inputs as relevant and docs-only changes as irrelevant', () => {
    expect(
      relevantChanges(['README.md', 'docs/benchmarks.md', 'AGENTS.md']),
    ).toBe(false);
    for (const path of [
      'packages/core/src/index.ts',
      'fixtures/next-16/app/page.tsx',
      'pnpm-lock.yaml',
      'scripts/benchmarks/run.mjs',
      '.github/workflows/benchmarks.yml',
    ])
      expect(relevantChanges([path])).toBe(true);
  });

  it('records approved timing costs without overriding invalid work', () => {
    const verdict = evaluateGate(report(10), report(13), policy, {
      base: report(10),
      head: report(13),
    });
    const approval = {
      enabled: true,
      reason: 'Intentional additional eligibility check',
      reviewers: ['maintainer'],
    };
    expect(applyOverride(verdict, approval)).toMatchObject({
      status: 'override',
      override: { measuredCost: [{ delta: 3, unit: 'us/op' }] },
    });
    expect(() =>
      applyOverride(verdict, { ...approval, reviewers: [] }),
    ).toThrow();
    expect(() =>
      applyOverride(verdict, { ...approval, enabled: false }),
    ).toThrow();
    expect(() =>
      applyOverride({ status: 'fail', error: 'Browser crashed' }, approval),
    ).toThrow();
  });

  it('reports a median and full range without rounding samples', () => {
    expect(summarize([5, 1, 4, 2, 3])).toEqual({ median: 3, min: 1, max: 5 });
  });

  it('requires both budgets and a confirming comparison', () => {
    expect(evaluateGate(report(10), report(13), policy).status).toBe('repeat');
    expect(
      evaluateGate(report(10), report(13), policy, {
        base: report(10),
        head: report(13),
      }).status,
    ).toBe('fail');
  });

  it('allows a slowdown that exceeds only one budget', () => {
    expect(evaluateGate(report(10), report(11.5), policy).status).toBe('pass');
    expect(evaluateGate(report(100), report(103), policy).status).toBe('pass');
  });

  it('allows disagreement between valid comparisons', () => {
    expect(
      evaluateGate(report(10), report(13), policy, {
        base: report(10),
        head: report(10),
      }).status,
    ).toBe('inconclusive');
  });

  it('fails incorrect, missing, and invalid work during calibration', () => {
    for (const bad of [Number.NaN, -1, Infinity]) {
      expect(
        evaluateGate(report(10), report(bad), { relative: 0.1, metrics: {} })
          .status,
      ).toBe('fail');
    }
    const bad = report(10);
    bad.metrics['core.fast.accepted'].checks[0] = false;
    expect(evaluateGate(report(10), bad, policy).status).toBe('fail');
    expect(
      evaluateGate(report(10), { ...report(10), metrics: {} }, policy).status,
    ).toBe('fail');
    expect(evaluateGate(report(10), null, policy).status).toBe('fail');
  });

  it('keeps timing report-only until budgets are approved', () => {
    expect(
      evaluateGate(report(10), report(100), { relative: 0.1, metrics: {} })
        .status,
    ).toBe('pass');
  });

  it('allows valid comparisons with different tested dependency versions', () => {
    const upgraded = report(10);
    upgraded.versions.next = '16.3.7';
    expect(
      evaluateGate(report(10), upgraded, { relative: 0.1, metrics: {} }).status,
    ).toBe('pass');
  });

  it('renders deterministic units, versions, two significant figures, and a durable link', () => {
    const input = report(12.345);
    const first = renderTable(input, 'https://example.com/release.json');
    expect(first).toContain('12 us/op');
    expect(first).toContain('16.3.6');
    expect(first).toContain('[Raw results](https://example.com/release.json)');
    expect(renderTable(input, 'https://example.com/release.json')).toBe(first);
  });
});

describe('comparison reports', () => {
  it('combines batches without changing their samples or correctness evidence', () => {
    const batches = Array.from({ length: 5 }, (_, batch) => ({
      ...report(10),
      elapsedMs: 100,
      navigationChecks: [{ batch }],
      metrics: {
        'core.fast.accepted': {
          unit: 'us/op',
          samples: [batch + 1],
          checks: [true],
          batches: [batch],
        },
      },
    }));
    const original = structuredClone(batches);
    const combined = combineBatches(batches);

    expect(combined.metrics['core.fast.accepted']).toEqual({
      unit: 'us/op',
      samples: [1, 2, 3, 4, 5],
      checks: [true, true, true, true, true],
      batches: [0, 1, 2, 3, 4],
      median: 3,
      min: 1,
      max: 5,
    });
    expect(combined.navigationChecks).toHaveLength(5);
    expect(combined.elapsedMs).toBe(500);
    expect(batches).toEqual(original);

    batches[4].metrics = {};
    expect(() => combineBatches(batches)).toThrow('Scenario set changed');
  });

  it('proposes budgets from the largest unchanged-code difference without enabling gates', () => {
    const comparisons = [1, 3, 2].map((difference) => ({
      base: report(10),
      head: report(10 + difference),
    }));
    expect(summarizeCalibration(comparisons)).toEqual({
      comparisons: 3,
      approvalRequired: true,
      noise: {
        'core.fast.accepted': {
          maxAbsoluteDifference: 3,
          proposedAbsoluteBudget: 6,
          unit: 'us/op',
        },
      },
    });
    comparisons[0].head.revision = 'b'.repeat(40);
    expect(() => summarizeCalibration(comparisons)).toThrow('unchanged code');
  });
});

describe('workflow commands', () => {
  let directory;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'benchmark-ci-'));
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
  });

  function execute(command, env = {}) {
    return spawnSync(
      process.execPath,
      [fileURLToPath(new URL('./benchmarks/ci.mjs', import.meta.url)), command],
      {
        encoding: 'utf8',
        env: { ...process.env, RUNNER_TEMP: directory, ...env },
      },
    );
  }

  it('records setup time and the relevance decision before artifact upload', () => {
    const summary = join(directory, 'summary');
    const result = execute('elapsed', {
      BENCHMARK_STARTED: String(Date.now() / 1000 - 2),
      RELEVANT: 'false',
      GITHUB_STEP_SUMMARY: summary,
    });
    expect(result.status, result.stderr).toBe(0);
    const elapsed = JSON.parse(
      readFileSync(join(directory, 'benchmark-results/full-run.json'), 'utf8'),
    );
    expect(elapsed.relevant).toBe('false');
    expect(elapsed.elapsedSeconds).toBeGreaterThanOrEqual(2);
    expect(readFileSync(summary, 'utf8')).toContain(
      'Benchmark setup, builds, and measurements:',
    );
  });

  it('resolves calibration to the current commit even when another base was requested', () => {
    const output = join(directory, 'outputs');
    const result = execute('select', {
      GITHUB_OUTPUT: output,
      CALIBRATE: 'true',
      MANUAL: 'true',
      REQUESTED_BASE: 'missing-ref',
    });
    expect(result.status, result.stderr).toBe(0);
    const revision = spawnSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).stdout.trim();
    expect(readFileSync(output, 'utf8')).toBe(
      `base=${revision}\nrelevant=true\n`,
    );
  });

  it('allows only completed verdicts and fails when the verdict is missing', () => {
    expect(execute('enforce').status).not.toBe(0);
    mkdirSync(join(directory, 'benchmark-results'));
    for (const status of [
      'pass',
      'inconclusive',
      'override',
      'repeat',
      'fail',
      'unknown',
    ]) {
      writeFileSync(
        join(directory, 'benchmark-results/verdict.json'),
        JSON.stringify({ status }),
      );
      expect(execute('enforce').status).toBe(
        ['pass', 'inconclusive', 'override'].includes(status) ? 0 : 1,
      );
    }
  });
});

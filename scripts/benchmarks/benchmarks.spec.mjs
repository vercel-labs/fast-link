import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { combineBatches } from './comparison-results.mjs';
import {
  evaluateComparison,
  scenarioNames,
  summarize,
  validateReport,
} from './report.mjs';

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
  metrics: { 'core.core.accepted': metric(value) },
});

describe('benchmark results', () => {
  it('validates list scenarios against recorded sizes rather than current defaults', () => {
    const input = report(10);
    input.conditions = { case: 'all', listSizes: [1, 10, 1000] };
    input.metrics = Object.fromEntries(
      scenarioNames().map((name) => [
        name.replace('.100.', '.10.'),
        metric(10),
      ]),
    );

    expect(() => validateReport(input)).not.toThrow();
    input.conditions.listSizes = [1, 100, 1000];
    expect(() => validateReport(input)).toThrow(
      'Missing or unexpected benchmark scenarios',
    );
  });

  it('reports a median and full range without rounding samples', () => {
    expect(summarize([5, 1, 4, 2, 3])).toEqual({ median: 3, min: 1, max: 5 });
    expect(summarize([1, 2, 3, 4, 5, 6])).toEqual({
      median: 3.5,
      min: 1,
      max: 6,
    });
  });

  it('accepts a valid slowdown without requesting confirmation', () => {
    expect(evaluateComparison(report(10), report(100))).toEqual({
      status: 'pass',
    });
  });

  it('allows different tested dependency versions on the same runner', () => {
    const upgraded = report(10);
    upgraded.versions.next = '16.3.7';
    expect(evaluateComparison(report(10), upgraded)).toEqual({
      status: 'pass',
    });
  });

  it.each([
    [
      'nonfinite samples',
      (input) => {
        input.metrics['core.core.accepted'].samples[0] = Number.NaN;
      },
    ],
    [
      'negative samples',
      (input) => {
        input.metrics['core.core.accepted'].samples[0] = -1;
      },
    ],
    [
      'infinite samples',
      (input) => {
        input.metrics['core.core.accepted'].samples[0] = Infinity;
      },
    ],
    [
      'incomplete samples',
      (input) => {
        input.metrics['core.core.accepted'].samples.pop();
      },
    ],
    [
      'incorrect work',
      (input) => {
        input.metrics['core.core.accepted'].checks[0] = false;
      },
    ],
    [
      'missing checks',
      (input) => {
        input.metrics['core.core.accepted'].checks.pop();
      },
    ],
    [
      'missing metrics',
      (input) => {
        input.metrics = {};
      },
    ],
    [
      'measurement errors',
      (input) => {
        input.errors = ['Browser crashed'];
      },
    ],
    [
      'missing revision',
      (input) => {
        delete input.revision;
      },
    ],
    [
      'missing environment',
      (input) => {
        delete input.environment;
      },
    ],
  ])('fails %s', (_, invalidate) => {
    const invalid = report(10);
    invalidate(invalid);
    expect(evaluateComparison(report(10), invalid)).toEqual({
      status: 'fail',
      error: expect.any(String),
    });
    expect(evaluateComparison(invalid, report(10)).status).toBe('fail');
  });

  it('fails a missing report', () => {
    expect(evaluateComparison(report(10), null).status).toBe('fail');
  });

  it.each([
    [
      'scenario sets',
      (input) => {
        input.metrics.other = metric(10);
      },
      'Scenario sets differ',
    ],
    [
      'runner environments',
      (input) => {
        input.environment.browser = 'Other browser';
      },
      'Environments differ: browser',
    ],
    [
      'units',
      (input) => {
        input.metrics['core.core.accepted'].unit = 'ms';
      },
      'Incompatible metric',
    ],
    [
      'sample counts',
      (input) => {
        input.metrics['core.core.accepted'].samples.push(10);
        input.metrics['core.core.accepted'].checks.push(true);
      },
      'Incompatible metric',
    ],
  ])('rejects incompatible %s', (_, change, error) => {
    const incompatible = report(10);
    change(incompatible);
    expect(evaluateComparison(report(10), incompatible)).toEqual({
      status: 'fail',
      error: expect.stringContaining(error),
    });
  });
});

describe('comparison reports', () => {
  it('combines batches without changing their samples or correctness evidence', () => {
    const batches = Array.from({ length: 5 }, (_, batch) => ({
      ...report(10),
      elapsedMs: 100,
      navigationChecks: [{ batch }],
      metrics: {
        'core.core.accepted': {
          unit: 'us/op',
          samples: [batch + 1],
          checks: [true],
          batches: [batch],
        },
      },
    }));
    const original = structuredClone(batches);
    const combined = combineBatches(batches);

    expect(combined.metrics['core.core.accepted']).toEqual({
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
});

describe('manual comparison command', () => {
  let directory;
  let argv;
  let exitCode;
  let measure;
  let close;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'benchmark-compare-'));
    argv = process.argv;
    exitCode = process.exitCode;
    process.exitCode = undefined;
    process.argv = [
      'node',
      'compare.mjs',
      '--base',
      '/disposable/base',
      '--output',
      directory,
    ];
    vi.resetModules();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    close = vi.fn();
    measure = vi.fn(async ({ root, output, batch }) => {
      const result = {
        ...report(root === '/disposable/base' ? 10 : 100),
        elapsedMs: 1,
        metrics: {
          'core.core.accepted': {
            unit: 'us/op',
            samples: [root === '/disposable/base' ? 10 : 100],
            checks: [true],
            batches: [batch],
          },
        },
      };
      await writeFile(output, JSON.stringify(result));
      return result;
    });
    vi.doMock('./prepare.mjs', () => ({ prepareCheckouts: vi.fn() }));
    vi.doMock('./session.mjs', () => ({
      createBenchmarkSession: () => ({ measure, close }),
    }));
  });

  afterEach(async () => {
    process.argv = argv;
    process.exitCode = exitCode;
    vi.doUnmock('./prepare.mjs');
    vi.doUnmock('./session.mjs');
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('accepts slower valid work after exactly five alternating batches', async () => {
    await import('./compare.mjs');
    expect(process.exitCode).toBeUndefined();
    expect(
      JSON.parse(await readFile(join(directory, 'verdict.json'), 'utf8')),
    ).toMatchObject({ status: 'pass', comparisons: 1 });
    expect(
      measure.mock.calls.map(([input]) => [
        input.root === '/disposable/base' ? 'base' : 'head',
        input.batch,
      ]),
    ).toEqual([
      ['base', 0],
      ['head', 0],
      ['head', 1],
      ['base', 1],
      ['base', 2],
      ['head', 2],
      ['head', 3],
      ['base', 3],
      ['base', 4],
      ['head', 4],
    ]);
    expect(
      JSON.parse(await readFile(join(directory, 'head.json'), 'utf8')).metrics[
        'core.core.accepted'
      ],
    ).toMatchObject({
      samples: [100, 100, 100, 100, 100],
      median: 100,
      min: 100,
      max: 100,
    });
    expect(close).toHaveBeenCalledOnce();
  });

  it('retains available raw diagnostics and closes the session after measurement failure', async () => {
    measure.mockImplementationOnce(async ({ output }) => {
      await writeFile(
        output,
        JSON.stringify({ errors: ['Browser crashed'], metrics: {} }),
      );
      throw new Error('Browser crashed');
    });
    await import('./compare.mjs');
    expect(process.exitCode).toBe(1);
    expect(
      JSON.parse(await readFile(join(directory, 'verdict.json'), 'utf8')),
    ).toMatchObject({
      status: 'fail',
      error: expect.stringContaining('Browser crashed'),
    });
    expect(
      JSON.parse(await readFile(join(directory, 'batch-0-base.json'), 'utf8'))
        .errors,
    ).toEqual(['Browser crashed']);
    expect(measure).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
  });

  it('fails when cleanup fails after valid measurements', async () => {
    close.mockRejectedValueOnce(new Error('Server did not close'));
    await import('./compare.mjs');
    expect(process.exitCode).toBe(1);
    expect(
      JSON.parse(await readFile(join(directory, 'verdict.json'), 'utf8')),
    ).toMatchObject({
      status: 'fail',
      error: expect.stringContaining('Server did not close'),
    });
    expect(close).toHaveBeenCalledOnce();
  });
});

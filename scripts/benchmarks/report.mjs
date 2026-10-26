import { workload } from './workload.mjs';

/** Summarizes unrounded samples in their original unit. */
export function summarize(samples) {
  if (
    !Array.isArray(samples) ||
    samples.length < 5 ||
    samples.some((n) => !Number.isFinite(n) || n < 0)
  )
    throw new Error('Expected at least five finite, nonnegative samples');

  const sorted = samples.toSorted((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);

  return {
    median:
      sorted.length % 2
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2,
    min: sorted[0],
    max: sorted.at(-1),
  };
}

/** Rejects incomplete work before accepting a measurement. */
export function validateReport(report) {
  if (
    report?.schema !== 1 ||
    !/^[a-f0-9]{40}$/.test(report.revision) ||
    !report.environment ||
    !report.versions ||
    !Object.keys(report.metrics ?? {}).length
  )
    throw new Error(
      'Missing benchmark identity, environment, versions, or metrics',
    );

  if (report.errors?.length) throw new Error('Benchmark reported errors');

  if (report.conditions) {
    const expected = scenarioNames(
      report.conditions.case,
      report.conditions.listSizes,
    );
    if (
      JSON.stringify(Object.keys(report.metrics).toSorted()) !==
      JSON.stringify(expected.toSorted())
    )
      throw new Error('Missing or unexpected benchmark scenarios');
  }

  for (const [name, metric] of Object.entries(report.metrics)) {
    summarize(metric.samples);
    if (
      !['us/op', 'ms'].includes(metric.unit) ||
      metric.checks?.length !== metric.samples.length ||
      metric.checks.some((check) => check !== true)
    )
      throw new Error(`Incorrect or incomplete work: ${name}`);
  }
}

/** Lists required scenarios using recorded list sizes when validating saved reports. */
export function scenarioNames(
  selected = 'all',
  listSizes = workload.listSizes,
) {
  if (!['all', 'core', 'react', 'next'].includes(selected))
    throw new Error('Unknown benchmark case');
  const names = [];
  if (selected === 'all' || selected === 'core')
    for (const variant of ['bare', 'core'])
      for (const kind of ['accepted', 'ignored'])
        names.push(`core.${variant}.${kind}`);
  if (selected === 'all' || selected === 'react')
    for (const variant of ['plain', 'react']) {
      for (const kind of ['accepted', 'ignored'])
        names.push(`react.${variant}.${kind}`);
      for (const kind of ['mount', 'update', 'unmount'])
        names.push(`react.${variant}.1.${kind}`);
    }
  if (selected === 'all' || selected === 'next')
    for (const variant of ['next', 'fast', 'region']) {
      for (const count of listSizes)
        for (const kind of ['mount', 'update', 'unmount'])
          names.push(`next.${variant}.${count}.${kind}`);
      for (const cache of ['warm', 'cold'])
        for (const kind of ['navigation', 'pressDuration'])
          names.push(`next.${variant}.${cache}.${kind}`);
    }
  return names;
}

/** Rejects differences in scenario sets, runner, units, or sample counts before comparison. */
function assertComparable(base, head) {
  validateReport(base);
  validateReport(head);

  const keys = Object.keys(base.metrics).toSorted();
  if (
    JSON.stringify(keys) !==
    JSON.stringify(Object.keys(head.metrics).toSorted())
  )
    throw new Error('Scenario sets differ');

  for (const key of ['platform', 'cpu', 'node', 'playwright', 'browser'])
    if (base.environment[key] !== head.environment[key])
      throw new Error(`Environments differ: ${key}`);

  for (const key of keys) {
    const before = base.metrics[key];
    const after = head.metrics[key];
    if (
      before.unit !== after.unit ||
      before.samples.length !== after.samples.length
    )
      throw new Error(`Incompatible metric: ${key}`);
  }
}

/** Validates both measurements and their compatibility; timing differences never fail. */
export function evaluateComparison(base, head) {
  try {
    assertComparable(base, head);
    return { status: 'pass' };
  } catch (error) {
    return { status: 'fail', error: error.message };
  }
}

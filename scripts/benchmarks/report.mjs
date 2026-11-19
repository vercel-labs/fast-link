import { workload } from './workload.mjs';

/**
 * Summarizes unrounded samples in their original unit. Signed metrics, such as
 * a destination commit before release, may contain negative samples.
 */
export function summarize(samples, { signed = false } = {}) {
  if (
    !Array.isArray(samples) ||
    samples.length < 5 ||
    samples.some((n) => !Number.isFinite(n) || (!signed && n < 0))
  )
    throw new Error(
      signed
        ? 'Expected at least five finite samples'
        : 'Expected at least five finite, nonnegative samples',
    );

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
    const expected = scenarioNames(report.conditions);
    if (
      JSON.stringify(Object.keys(report.metrics).toSorted()) !==
      JSON.stringify(expected.toSorted())
    )
      throw new Error('Missing or unexpected benchmark scenarios');
  }

  for (const [name, metric] of Object.entries(report.metrics)) {
    summarize(metric.samples, metric);
    if (
      !['us/op', 'ms'].includes(metric.unit) ||
      metric.checks?.length !== metric.samples.length ||
      metric.checks.some((check) => check !== true)
    )
      throw new Error(`Incorrect or incomplete work: ${name}`);
  }
}

const LIFECYCLE = ['mount', 'rerender', 'update', 'unmount'];
const NAVIGATION = ['navigation', 'pressDuration', 'releaseToCommit'];
const INTERACTION = ['accepted', 'ignored'];

/**
 * Lists required scenarios from recorded conditions when validating saved
 * reports. Missing conditions use the current workload.
 */
export function scenarioNames({
  case: selected = 'all',
  listSizes = workload.listSizes,
  modes = workload.modes,
  caches = workload.caches,
  holdsMs = workload.holdsMs,
} = {}) {
  if (!['all', 'core', 'react', 'next'].includes(selected))
    throw new Error('Unknown benchmark case');
  if (!modes.length || modes.some((mode) => !workload.modes.includes(mode)))
    throw new Error('Unknown benchmark mode');
  const names = [];
  const add = (prefix, kinds) => {
    for (const kind of kinds) names.push(`${prefix}.${kind}`);
  };
  if (selected === 'all' || selected === 'core') addCore(add, modes);
  if (selected === 'all' || selected === 'react') addReact(add, modes);
  if (selected === 'all' || selected === 'next')
    addNext(add, { listSizes, modes, caches, holdsMs });
  return names;
}

function addCore(add, modes) {
  add('core.bare', INTERACTION);
  for (const mode of modes) add(`core.core.${mode}`, INTERACTION);
}

function addReact(add, modes) {
  add('react.plain', INTERACTION);
  add('react.plain.1', LIFECYCLE);
  for (const mode of modes) {
    add(`react.react.${mode}`, INTERACTION);
    add(`react.react.${mode}.1`, LIFECYCLE);
  }
}

function addNext(add, { listSizes, modes, caches, holdsMs }) {
  const variants = [
    'next.next',
    ...modes.flatMap((mode) => [`next.fast.${mode}`, `next.region.${mode}`]),
  ];
  for (const variant of variants) {
    for (const count of listSizes) add(`${variant}.${count}`, LIFECYCLE);
    for (const cache of caches)
      for (const hold of holdsMs)
        add(`${variant}.${cache}.hold${hold}`, NAVIGATION);
  }
  // Switching needs a second mode.
  if (modes.length < 2) return;
  for (const variant of ['fast', 'region'])
    for (const count of listSizes)
      add(`next.${variant}.switch.${count}`, modes);
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

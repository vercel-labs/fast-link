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

/** Rejects incomplete work before any timing decision or publication. */
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
    const expected = scenarioNames(report.conditions.case);
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

/** Lists the required scenarios for a complete run of the selected case. */
export function scenarioNames(selected = 'all') {
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
      for (const count of [1, 100, 1000])
        for (const kind of ['mount', 'update', 'unmount'])
          names.push(`next.${variant}.${count}.${kind}`);
      for (const cache of ['warm', 'cold'])
        for (const kind of ['navigation', 'pressDuration'])
          names.push(`next.${variant}.${cache}.${kind}`);
    }
  return names;
}

function compare(base, head, policy) {
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
  const regressions = [];
  for (const key of keys) {
    const before = base.metrics[key];
    const after = head.metrics[key];
    if (
      before.unit !== after.unit ||
      before.samples.length !== after.samples.length
    )
      throw new Error(`Incompatible metric: ${key}`);
    const budget = policy.metrics[key];
    if (!budget) continue;
    if (
      !/^(core|react)\./.test(key) ||
      !(budget.absolute > 0) ||
      !(policy.relative > 0)
    )
      throw new Error(`Invalid gate budget: ${key}`);
    const baseline = summarize(before.samples).median;
    const current = summarize(after.samples).median;
    if (
      current - baseline > budget.absolute &&
      current > baseline * (1 + policy.relative)
    )
      regressions.push({
        metric: key,
        base: baseline,
        head: current,
        delta: current - baseline,
        unit: before.unit,
      });
  }
  for (const key of Object.keys(policy.metrics))
    if (!head.metrics[key]) throw new Error(`Gated metric missing: ${key}`);
  return regressions;
}

/** Requires a second valid comparison before failing a timing regression. */
export function evaluateGate(base, head, policy, confirmation) {
  try {
    const regressions = compare(base, head, policy);
    if (!regressions.length) return { status: 'pass', regressions };
    if (!confirmation) return { status: 'repeat', regressions };
    if (
      confirmation.base.revision !== base.revision ||
      confirmation.head.revision !== head.revision
    )
      throw new Error('Confirmation revisions differ');
    const repeated = compare(confirmation.base, confirmation.head, policy);
    const confirmed = regressions.filter(({ metric }) =>
      repeated.some((item) => item.metric === metric),
    );
    return {
      status: confirmed.length ? 'fail' : 'inconclusive',
      regressions,
      confirmed,
    };
  } catch (error) {
    return { status: 'fail', error: error.message };
  }
}

/** Generates stable README content from verified results, without run timestamps. */
export function renderTable(report, url, previous) {
  validateReport(report);
  if (previous) validateReport(previous);
  if (!url.startsWith('https://'))
    throw new Error('A durable HTTPS result URL is required');
  const rows = Object.entries(report.metrics)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([name, metric]) => {
      const { median, min, max } = summarize(metric.samples);
      const before = previous?.metrics[name];
      const delta =
        before && before.unit === metric.unit
          ? `${Number((median - summarize(before.samples).median).toPrecision(2))} ${metric.unit}`
          : 'N/A';
      return `| ${name} | ${Number(median.toPrecision(2))} ${metric.unit} | ${Number(min.toPrecision(2))}–${Number(max.toPrecision(2))} ${metric.unit} | ${delta} |`;
    });
  return [
    '[How we benchmark](docs/benchmarks.md)',
    '',
    '| Scenario | Median | Range | Change from previous release |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    `Tested versions: ${Object.entries(report.versions)
      .map(([name, version]) => `${name} ${version}`)
      .join(', ')}.`,
    `Release commit: ${report.revision}. [Raw results](${url}).`,
    ...(previous
      ? [
          `Previous release tested versions: ${Object.entries(previous.versions)
            .map(([name, version]) => `${name} ${version}`)
            .join(', ')}.`,
        ]
      : []),
    'Controlled lab measurements. Navigation latency differences include the time next/link waits for mouse release. These results do not establish faster JavaScript execution or typical-user gains.',
  ].join('\n');
}

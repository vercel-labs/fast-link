import { summarize, validateReport } from './report.mjs';

/** Combines one revision's batches and validates the resulting complete report. */
export function combineBatches(reports) {
  const [first, ...rest] = reports;
  const combined = structuredClone(first);

  combined.navigationChecks = reports.flatMap(
    (report) => report.navigationChecks ?? [],
  );
  combined.elapsedMs = reports.reduce(
    (sum, report) => sum + report.elapsedMs,
    0,
  );

  for (const report of rest) {
    if (
      JSON.stringify(Object.keys(report.metrics).toSorted()) !==
      JSON.stringify(Object.keys(first.metrics).toSorted())
    ) {
      throw new Error('Scenario set changed between batches');
    }

    for (const [name, metric] of Object.entries(report.metrics)) {
      combined.metrics[name].samples.push(...metric.samples);
      combined.metrics[name].checks.push(...metric.checks);
      combined.metrics[name].batches.push(...metric.batches);
    }
  }

  for (const metric of Object.values(combined.metrics)) {
    Object.assign(metric, summarize(metric.samples));
  }

  validateReport(combined);
  return combined;
}

/** Proposes budgets from unchanged-code noise; approval remains a separate step. */
export function summarizeCalibration(comparisons) {
  if (comparisons.some((pair) => pair.base.revision !== pair.head.revision)) {
    throw new Error('Calibration requires unchanged code (the same revision)');
  }

  const first = comparisons[0];
  const names = Object.keys(first.head.metrics).filter((name) =>
    /^(core|react)\./.test(name),
  );
  const noise = {};

  for (const name of names) {
    const differences = comparisons.map((pair) =>
      Math.abs(
        summarize(pair.head.metrics[name].samples).median -
          summarize(pair.base.metrics[name].samples).median,
      ),
    );
    const maximum = Math.max(...differences);

    noise[name] = {
      maxAbsoluteDifference: maximum,
      proposedAbsoluteBudget: maximum * 2,
      unit: first.head.metrics[name].unit,
    };
  }

  return { comparisons: comparisons.length, noise, approvalRequired: true };
}

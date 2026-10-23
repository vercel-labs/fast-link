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

import { summarize, validateReport } from './report.mjs';

const start = '<!-- benchmarks:start -->';
const end = '<!-- benchmarks:end -->';

/** Replaces only the generated README region; identical output stays unchanged. */
export function updateReadme(readme, table) {
  const before = readme.indexOf(start);
  const after = readme.indexOf(end);
  if (before < 0 || after < before)
    throw new Error('Missing README benchmark markers');
  return `${readme.slice(0, before + start.length)}\n${table}\n${readme.slice(after)}`;
}

/** Generates collapsible current-result content without release deltas or run timestamps. */
export function renderTable(report, url) {
  validateReport(report);
  if (!url.startsWith('https://'))
    throw new Error('A durable HTTPS result URL is required');
  const rows = Object.entries(report.metrics)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([name, metric]) => renderRow(name, metric));

  return [
    '[How we benchmark](docs/benchmarks.md)',
    '',
    '<details>',
    '<summary>View all scenarios</summary>',
    '',
    '| Scenario ID | Median | Range |',
    '| --- | --- | --- |',
    ...rows,
    '',
    `Tested versions: ${formatVersions(report.versions)}.`,
    `Source commit: ${report.revision}. [Raw results](${url}).`,
    'Controlled lab measurements. Navigation latency differences include the time next/link waits for mouse release. These results do not establish faster JavaScript execution or typical-user gains.',
    '',
    '</details>',
  ].join('\n');
}

/** Rounds display values only; gate decisions retain the original samples. */
function formatValue(value) {
  return Number(value.toPrecision(2));
}

function formatVersions(versions) {
  return Object.entries(versions)
    .map(([name, version]) => `${name} ${version}`)
    .join(', ');
}

/** Formats one scenario's current median and full sample range. */
function renderRow(name, metric) {
  const { median, min, max } = summarize(metric.samples);
  const range = `${formatValue(min)}–${formatValue(max)} ${metric.unit}`;

  return `| ${name} | ${formatValue(median)} ${metric.unit} | ${range} |`;
}

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

/** Generates stable README content from verified results, without run timestamps. */
export function renderTable(report, url, previous) {
  validateReport(report);
  if (previous) validateReport(previous);
  if (!url.startsWith('https://'))
    throw new Error('A durable HTTPS result URL is required');
  const rows = Object.entries(report.metrics)
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([name, metric]) => renderRow(name, metric, previous?.metrics[name]));

  return [
    '[How we benchmark](docs/benchmarks.md)',
    '',
    '| Scenario | Median | Range | Change from previous release |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
    `Tested versions: ${formatVersions(report.versions)}.`,
    `Release commit: ${report.revision}. [Raw results](${url}).`,
    ...(previous
      ? [
          `Previous release tested versions: ${formatVersions(previous.versions)}.`,
        ]
      : []),
    'Controlled lab measurements. Navigation latency differences include the time next/link waits for mouse release. These results do not establish faster JavaScript execution or typical-user gains.',
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

/** Compares matching units and leaves the first release's change unspecified. */
function renderRow(name, metric, previous) {
  const { median, min, max } = summarize(metric.samples);
  const change =
    previous && previous.unit === metric.unit
      ? `${formatValue(median - summarize(previous.samples).median)} ${metric.unit}`
      : 'N/A';
  const range = `${formatValue(min)}–${formatValue(max)} ${metric.unit}`;

  return `| ${name} | ${formatValue(median)} ${metric.unit} | ${range} | ${change} |`;
}

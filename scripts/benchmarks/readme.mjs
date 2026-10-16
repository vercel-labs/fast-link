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

/** Generates baseline comparisons; diagnostic measurements stay in the raw report. */
export function renderTable(report, url) {
  validateReport(report);
  if (!url.startsWith('https://'))
    throw new Error('A durable HTTPS result URL is required');
  return [
    '[How we benchmark](docs/benchmarks.md)',
    '',
    '<details>',
    '<summary>View benchmark comparisons</summary>',
    '',
    "Cells show median (min–max). Replace `*` in each scenario ID with the column's variant key.",
    '',
    '### Core',
    '',
    ...renderComparison(
      report.metrics,
      'core',
      [
        ['bare', 'Bare DOM (`bare`, baseline)'],
        ['core', '`createFastLink` (`core`)'],
      ],
      ['accepted', 'ignored'],
    ),
    '',
    '### React',
    '',
    ...renderComparison(
      report.metrics,
      'react',
      [
        ['plain', 'Plain anchor (`plain`, baseline)'],
        ['react', '`useFastLink` (`react`)'],
      ],
      ['accepted', 'ignored'],
    ),
    '',
    '### Next.js',
    '',
    'Navigation measures pointerdown to destination commit with an 80 ms mouse hold. `next/link` waits for release; earlier navigation does not establish faster JavaScript execution or typical-user gains.',
    '',
    ...renderComparison(
      report.metrics,
      'next',
      [
        ['next', '`next/link` (`next`, baseline)'],
        ['fast', '`FastLink` (`fast`)'],
        ['region', '`FastLinkRegion` (`region`)'],
      ],
      [
        'warm.navigation',
        'cold.navigation',
        '100.mount',
        '100.update',
        '100.unmount',
        '1000.mount',
        '1000.update',
        '1000.unmount',
      ],
    ),
    '',
    'Raw results include all 53 measurements, including actual press durations and single-link lifecycle timings. Single-link timings can reach browser timer resolution.',
    '',
    `Tested versions: ${formatVersions(report.versions)}.`,
    `Source commit: ${report.revision}. [Raw results](${url}).`,
    'Controlled Chromium lab measurements.',
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

/** Pairs each workload with its baseline and adapter variants, in display order. */
function renderComparison(metrics, prefix, variants, workloads) {
  return [
    `| Scenario ID | ${variants.map(([, label]) => label).join(' | ')} |`,
    `| --- | ${variants.map(() => '---').join(' | ')} |`,
    ...workloads.map((workload) => {
      const cells = variants.map(([variant]) => {
        const name = `${prefix}.${variant}.${workload}`;
        if (!metrics[name]) throw new Error(`Missing README scenario: ${name}`);
        return formatMetric(metrics[name]);
      });
      return `| \`${prefix}.*.${workload}\` | ${cells.join(' | ')} |`;
    }),
  ];
}

/** Formats a median and full sample range in their shared unit. */
function formatMetric(metric) {
  const { median, min, max } = summarize(metric.samples);
  return `${formatValue(median)} (${formatValue(min)}–${formatValue(max)}) ${metric.unit}`;
}

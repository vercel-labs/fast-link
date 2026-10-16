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
  const holdMs = report.conditions?.holdMs;
  if (!Number.isFinite(holdMs) || holdMs <= 0)
    throw new Error('README requires the measured mouse hold in milliseconds');
  return [
    `[How we benchmark](docs/benchmarks.md) · [Raw results](${url})`,
    '',
    '<details>',
    '<summary>View benchmark comparisons</summary>',
    '',
    ...renderConditions(report),
    '',
    '### Core',
    '',
    ...renderComparison(
      report.metrics,
      'core',
      [
        ['bare', 'Bare DOM (baseline)'],
        ['core', '`createFastLink`'],
      ],
      [
        ['accepted', 'Mouse press and click'],
        ['ignored', 'Ignored touch press'],
      ],
    ),
    '',
    '### React',
    '',
    ...renderComparison(
      report.metrics,
      'react',
      [
        ['plain', 'Plain anchor (baseline)'],
        ['react', '`useFastLink`'],
      ],
      [
        ['accepted', 'Mouse press and click'],
        ['ignored', 'Ignored touch press'],
      ],
    ),
    '',
    '### Next.js',
    '',
    'Navigation measures mouse press to destination commit. `next/link` waits for release; earlier navigation does not establish faster JavaScript execution or typical-user gains.',
    '',
    ...renderComparison(
      report.metrics,
      'next',
      [
        ['next', '`next/link` (baseline)'],
        ['fast', '`FastLink`'],
        ['region', '`FastLinkRegion`'],
      ],
      [
        ['warm.navigation', 'Navigate to prefetched route'],
        ['cold.navigation', 'Navigate to unprefetched route'],
        ['100.mount', 'Mount 100 links'],
        ['100.update', 'Update 100 links'],
        ['100.unmount', 'Unmount 100 links'],
        ['1000.mount', 'Mount 1,000 links'],
        ['1000.update', 'Update 1,000 links'],
        ['1000.unmount', 'Unmount 1,000 links'],
      ],
    ),
    '',
    '</details>',
  ].join('\n');
}

/** States the recorded workload and scoring method; rejects incomplete batch summaries. */
function renderConditions(report) {
  const { batches, interactions, warmup, holdMs } = report.conditions;
  if (
    !Number.isInteger(batches) ||
    batches < 1 ||
    !Number.isInteger(interactions) ||
    interactions < 1 ||
    !Number.isInteger(warmup) ||
    warmup < 0 ||
    Object.values(report.metrics).some(
      (metric) => metric.samples.length !== batches,
    )
  )
    throw new Error('README requires workload counts and one sample per batch');

  return [
    `- Runs: ${batches} alternating batches, ${batches} samples per scenario.`,
    '- Score: median time per workload; ranges and individual samples are in raw results.',
    `- Mouse hold: **${holdMs} ms** requested for all navigation variants.`,
    `- Interaction workload: ${interactions.toLocaleString('en-US')} synthetic interactions per sample, after ${warmup.toLocaleString('en-US')} warmups. Times are per interaction.`,
  ];
}

/** Rounds display values only; gate decisions retain the original samples. */
function formatValue(value) {
  return Number(value.toPrecision(2));
}

/** Pairs each workload with its baseline and adapter variants, in display order. */
function renderComparison(metrics, prefix, variants, workloads) {
  return [
    `| Workload (median time) | ${variants.map(([, label]) => label).join(' | ')} |`,
    `| --- | ${variants.map(() => '---').join(' | ')} |`,
    ...workloads.map(([workload, label]) => {
      const cells = variants.map(([variant]) => {
        const name = `${prefix}.${variant}.${workload}`;
        if (!metrics[name]) throw new Error(`Missing README scenario: ${name}`);
        return formatMetric(metrics[name]);
      });
      return `| ${label} | ${cells.join(' | ')} |`;
    }),
  ];
}

/** Formats the median in milliseconds or microseconds per interaction. */
function formatMetric(metric) {
  const { median } = summarize(metric.samples);
  const unit = metric.unit === 'us/op' ? 'µs' : metric.unit;
  return `${formatValue(median)} ${unit}`;
}

import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { createBenchmarkSession } from './session.mjs';

/** Validates CLI inputs before starting a production server. */
function readOptions() {
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: process.cwd() },
      output: { type: 'string' },
      case: { type: 'string', default: 'all' },
    },
  });
  if (!values.output || !['all', 'core', 'react', 'next'].includes(values.case))
    throw new Error(
      'Usage: pnpm benchmark --output FILE [--case core|react|next]',
    );
  return {
    ...values,
    root: resolve(values.root),
    output: resolve(values.output),
  };
}

/** Runs a local benchmark and always releases its browser and production server. */
async function main() {
  const values = readOptions();
  const session = createBenchmarkSession();
  try {
    await session.measure({
      root: values.root,
      output: values.output,
      selected: values.case,
    });
  } finally {
    await session.close();
  }
}

await main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});

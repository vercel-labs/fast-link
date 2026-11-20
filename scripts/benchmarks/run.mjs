import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

import { readCase, readModes, readRtt } from './options.mjs';
import { runCommand } from './process.mjs';
import { createBenchmarkSession } from './session.mjs';

/** Validates CLI inputs before starting a production server. */
function readOptions() {
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: process.cwd() },
      output: { type: 'string' },
      case: { type: 'string', default: 'all' },
      modes: { type: 'string' },
      rtt: { type: 'string' },
    },
  });
  if (!values.output)
    throw new Error(
      'Usage: pnpm benchmark --output FILE [--case core|react|next] [--modes release,immediate,native] [--rtt MS]',
    );
  const rttMs = readRtt(values.rtt);
  return {
    ...values,
    case: readCase(values.case, rttMs),
    modes: readModes(values.modes),
    rttMs,
    root: resolve(values.root),
    output: resolve(values.output),
  };
}

/**
 * Builds the fixture for the measured tree, then runs a local benchmark and
 * always releases its browser and production server.
 */
async function main() {
  const values = readOptions();
  // Turbo replays a cached build when sources are unchanged. Building before
  // the session starts keeps it outside server readiness and every batch.
  await runCommand(
    'pnpm',
    ['exec', 'turbo', 'run', 'build', '--filter=@fast-link/fixture-next-16...'],
    values.root,
  );
  const session = createBenchmarkSession();
  try {
    await session.measure({
      root: values.root,
      output: values.output,
      selected: values.case,
      modes: values.modes,
      rttMs: values.rttMs,
    });
  } finally {
    await session.close();
  }
}

await main().catch((error) => {
  console.error(error.stack);
  process.exitCode = 1;
});

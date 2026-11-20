import { workload } from './workload.mjs';

const CASES = new Set(['all', 'core', 'react', 'next']);

/**
 * Parses a comma-separated `--modes` value in workload order; omitted means
 * every mode. Comparisons measure the same modes in both revisions, so pass
 * `--modes` when the base supports fewer.
 */
export function readModes(value) {
  if (value === undefined) return [...workload.modes];
  const requested = value.split(',').map((mode) => mode.trim());
  if (
    !requested.length ||
    requested.some((mode) => !workload.modes.includes(mode))
  )
    throw new Error(`Unknown benchmark modes: ${value}`);
  return workload.modes.filter((mode) => requested.includes(mode));
}

/**
 * Parses `--rtt` as whole milliseconds of added round-trip time. Omitted or 0
 * measures on localhost without a proxy.
 */
export function readRtt(value) {
  if (value === undefined) return 0;
  if (!/^\d+$/.test(value)) throw new Error(`Invalid benchmark RTT: ${value}`);
  return Number(value);
}

/**
 * Validates `--case` for the selected RTT. A delayed run measures only Next.js
 * navigation, so it records the `next` case and rejects core or React cases.
 */
export function readCase(value, rttMs) {
  if (!CASES.has(value)) throw new Error(`Unknown benchmark case: ${value}`);
  if (rttMs === 0) return value;
  if (value !== 'all' && value !== 'next')
    throw new Error(`--rtt measures only Next.js navigation, not ${value}`);
  return 'next';
}

import { workload } from './workload.mjs';

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

/** Shared settings for execution, report metadata, and expected scenarios. */
export const workload = Object.freeze({
  batches: 5,
  interactions: 1000,
  warmup: 100,
  holdMs: 85,
  listSizes: Object.freeze([1, 100, 1000]),
});

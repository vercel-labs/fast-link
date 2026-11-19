/** Shared settings for execution, report metadata, and expected scenarios. */
export const workload = Object.freeze({
  batches: 5,
  interactions: 1000,
  warmup: 100,
  // Round-robin real navigations per scenario in each batch.
  navigationSamples: 5,
  // 85 ms is the labeled lab hold; 0 presses and releases without an inserted wait.
  holdsMs: Object.freeze([85, 0]),
  modes: Object.freeze(['release', 'immediate', 'native']),
  caches: Object.freeze(['warm', 'cold', 'prefetch']),
  listSizes: Object.freeze([1, 100, 1000]),
});

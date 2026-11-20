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
  // Navigation scenarios measured instead of every other workload when `--rtt`
  // adds network delay. Warm and native navigations make no route request
  // after the press, so delay cannot change them.
  network: Object.freeze({
    destinations: Object.freeze(['static', 'dynamic']),
    caches: Object.freeze(['cold', 'prefetch']),
    // Assumed typical human hold: 44% of 2,795 production clicks fell in
    // 80-120 ms (https://github.com/andyed/clicksense, a README, not peer-reviewed).
    holdsMs: Object.freeze([100, 0]),
    // [variant, mode] pairs; the Next Link baseline has no mode.
    variants: Object.freeze([
      Object.freeze(['next', null]),
      Object.freeze(['fast', 'release']),
      Object.freeze(['region', 'release']),
      Object.freeze(['fast', 'immediate']),
    ]),
  }),
});

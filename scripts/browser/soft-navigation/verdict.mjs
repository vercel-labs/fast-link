/** Ordinary Next Link: the control every comparison depends on. */
export const BASELINE_VARIANT = 'next';

/** Release integrations that must match a detected baseline. */
export const RELEASE_VARIANTS = ['fast', 'region'];

/** Immediate integrations, measured and disclosed without a verdict. */
export const IMMEDIATE_VARIANTS = ['immediate', 'immediate-region'];

/**
 * Checks one observed navigation against its variant's acceptance event and
 * counts the soft-navigation entries Chrome reported for the destination. A run
 * with problems is invalid: its detection result cannot count toward a
 * comparison. Times in the timeline are milliseconds after pointerdown.
 */
export function classifyRun(observation, { variant, destinationUrl }) {
  const problems = [];
  const { after, before, pageLog } = observation;
  const isPressAccepted = IMMEDIATE_VARIANTS.includes(variant);
  const trusted = (type, onLink) =>
    pageLog.events.filter(
      (event) =>
        event.type === type &&
        event.isTrusted &&
        (onLink === undefined || event.onLink === onLink),
    );
  const presses = trusted('pointerdown', true);
  const clicks = trusted('click');
  const linkClicks = trusted('click', true);
  const pushes = pageLog.navigations.filter(
    (entry) => entry.navigationType === 'push' && entry.url === destinationUrl,
  );
  const softNavigations = pageLog.softNavigations.filter(
    (entry) => entry.name === destinationUrl,
  );
  const timeline = describeTimeline(observation, presses, clicks, pushes);

  if (!observation.cache.matched) problems.push('cache state');
  if (observation.navigationError) problems.push('navigation timeout');
  if (after.url !== destinationUrl) problems.push('final URL');
  if (!pageLog.destination) problems.push('destination content');
  if (observation.documentRequests !== 0) problems.push('document request');
  if (presses.length !== 1)
    problems.push(`trusted link presses: ${presses.length}`);
  // A press-accepted navigation can replace the link before release, so its
  // follow-up click may target other content or not occur.
  if (isPressAccepted ? clicks.length > 1 : linkClicks.length !== 1)
    problems.push(
      `trusted clicks: ${clicks.length} (${linkClicks.length} on link)`,
    );
  if (pushes.length !== 1) problems.push(`history pushes: ${pushes.length}`);
  const acceptedAt = isPressAccepted ? timeline.pointerdown : timeline.click;
  if (pushes.length && acceptedAt !== null && timeline.push < acceptedAt)
    problems.push('history push before acceptance');
  const historyDelta = after.historyLength - before.historyLength;
  if (historyDelta !== 1) problems.push(`history delta: ${historyDelta}`);
  if (observation.pageErrors.length) problems.push('page error');
  if (softNavigations.length > 1)
    problems.push(`soft-navigation entries: ${softNavigations.length}`);
  return {
    valid: problems.length === 0,
    detected: softNavigations.length > 0,
    problems,
    timeline,
  };
}

/**
 * Compares each release variant with the ordinary Next Link baseline in one
 * scenario. Every baseline repetition must be valid and detected; otherwise the
 * comparison is inconclusive. A release variant passes only when every
 * repetition is valid and detected.
 */
export function summarizeScenario(runs) {
  const select = (variant) => runs.filter((run) => run.variant === variant);
  const baseline = describeRuns(select(BASELINE_VARIANT));
  const isBaselineDetected =
    baseline.runs > 0 && baseline.detected === baseline.runs;
  const release = Object.fromEntries(
    RELEASE_VARIANTS.map((variant) => {
      const result = describeRuns(select(variant));
      return [
        variant,
        { ...result, verdict: decideRelease(isBaselineDetected, result) },
      ];
    }),
  );
  const immediate = Object.fromEntries(
    IMMEDIATE_VARIANTS.map((variant) => [
      variant,
      { ...describeRuns(select(variant)), verdict: 'disclosed' },
    ]),
  );
  return { baseline: { ...baseline, isBaselineDetected }, release, immediate };
}

/**
 * Combines scenario verdicts for one release integration: any failure fails
 * it, then any inconclusive scenario leaves it inconclusive.
 */
export function summarizeIntegration(scenarioSummaries, variant) {
  const verdicts = scenarioSummaries.map(
    (summary) => summary.release[variant].verdict,
  );
  if (verdicts.length === 0) return 'inconclusive';
  if (verdicts.includes('fail')) return 'fail';
  if (verdicts.includes('inconclusive')) return 'inconclusive';
  return 'pass';
}

function decideRelease(isBaselineDetected, result) {
  if (!isBaselineDetected) return 'inconclusive';
  return result.runs > 0 && result.detected === result.runs ? 'pass' : 'fail';
}

// Counts detection only for valid runs, so an invalid run never helps a verdict.
function describeRuns(runs) {
  return {
    runs: runs.length,
    valid: runs.filter((run) => run.valid).length,
    detected: runs.filter((run) => run.valid && run.detected).length,
    problems: runs.flatMap((run) =>
      run.problems.map((problem) => `repetition ${run.repetition}: ${problem}`),
    ),
  };
}

function describeTimeline(observation, presses, clicks, pushes) {
  const { pageLog, resources } = observation;
  const origin = presses[0]?.time ?? null;
  const since = (time) =>
    origin === null || time === undefined || time === null
      ? null
      : Math.round((time - origin) * 10) / 10;
  // Excludes rendered-link prefetches completed before the press.
  const interactionResource = resources.find(
    (entry) => origin === null || entry.startTime >= origin - 1,
  );
  const entry = pageLog.softNavigations[0];
  return {
    pointerdown: since(presses[0]?.time),
    pointerup: since(
      pageLog.events.find((event) => event.type === 'pointerup')?.time,
    ),
    click: since(clicks[0]?.time),
    clickPrevented: clicks[0]?.defaultPrevented ?? null,
    destinationRequest: since(interactionResource?.startTime),
    destinationResponse: since(interactionResource?.responseEnd),
    push: since(pushes[0]?.time),
    content: since(pageLog.destination?.time),
    softNavigationStart: since(entry?.startTime),
    softNavigationInteractionId: entry?.interactionId ?? null,
  };
}

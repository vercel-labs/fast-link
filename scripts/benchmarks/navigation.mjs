const TARGET_PATH = '/docs/benchmark/target';

/**
 * Lists the event counts one correct navigation produces for a variant and mode.
 * `accepted` counts Fast Link navigations. `suppressed` counts link `onClick`
 * calls that see the click already prevented: immediate suppression, or a
 * region accepting a release click during capture. `FastLink` accepts a release
 * click after its `onClick`, in Next Link's `onNavigate`.
 */
export function expectedNavigation(variant, mode) {
  const isFast = variant !== 'next' && mode !== 'native';
  return {
    accepted: isFast ? 1 : 0,
    suppressed:
      isFast && (mode === 'immediate' || variant === 'region') ? 1 : 0,
    // Only immediate mode may commit before the button is released.
    commitsAfterRelease: !isFast || mode !== 'immediate',
    requiresPreparation: isFast && mode === 'release',
  };
}

/**
 * Checks committed content, the completed follow-up click, event suppression,
 * one Fast Link navigation, and a single history entry.
 */
export function navigationCorrect(observed, expected, historyBefore) {
  return (
    observed.text === 'Benchmark destination' &&
    observed.destination?.text === observed.text &&
    observed.start > 0 &&
    observed.release >= observed.start &&
    observed.destination.committed >= observed.start &&
    (!expected.commitsAfterRelease ||
      observed.destination.committed >= observed.release) &&
    (!expected.requiresPreparation || observed.preparation === true) &&
    observed.clicks === 1 &&
    observed.prevented === 1 &&
    observed.accepted === expected.accepted &&
    observed.suppressed === expected.suppressed &&
    observed.history === historyBefore + 1
  );
}

function isRouteRequest(request) {
  return (
    new URL(request.url()).pathname === TARGET_PATH &&
    request.headers().rsc === '1'
  );
}

/** Waits for a successful route response containing destination content. */
function waitForDestinationResponse(page) {
  return page.waitForResponse(
    async (response) =>
      isRouteRequest(response.request()) &&
      response.ok() &&
      (await response.text()).includes('data-benchmark-destination'),
  );
}

/**
 * Establishes and verifies the pre-press router cache:
 * - warm: public `router.prefetch` delivered destination content;
 * - cold: no route request;
 * - prefetch: the rendered link's default Next prefetch delivered destination content.
 * Returns the route requests made before pressing.
 */
async function prepareCache(page, cache, routeRequests, render) {
  const prefetched = cache === 'cold' ? null : waitForDestinationResponse(page);
  await render();
  if (cache === 'warm') await page.evaluate(() => window.benchmark.prefetch());
  if (prefetched) await requireCompletedResponse(await prefetched);
  await requireCompletedRequests(routeRequests);
  const beforeRequests = routeRequests.length;
  if (
    (cache === 'cold' && beforeRequests !== 0) ||
    (cache !== 'cold' && beforeRequests === 0)
  )
    throw new Error(`Unverified ${cache} cache state`);
  return beforeRequests;
}

/** Waits for destination commit and the complete press/release/click sequence. */
async function pressAndWait(page, holdMs) {
  const anchor = page.locator('[data-benchmark-area] a');
  const box = await anchor.boundingBox();
  if (!box) throw new Error('Missing navigation anchor');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // A zero hold releases without a deliberately inserted wait.
  if (holdMs > 0) await page.waitForTimeout(holdMs);
  await page.mouse.up();
  await page.locator('[data-benchmark-destination]').waitFor();
  await page.waitForFunction(
    () =>
      Boolean(window.benchmarkDestination) &&
      window.benchmark.events.release > 0 &&
      window.benchmark.events.clicks > 0,
  );
}

/** Requires a successful, fully received route response before reading cache evidence. */
async function requireCompletedResponse(response) {
  if (!response?.ok()) throw new Error('Benchmark route response failed');
  const error = await response.finished();
  if (error) throw error;
}

async function requireCompletedRequests(requests) {
  await Promise.all(
    requests.map(async (request) =>
      requireCompletedResponse(await request.response()),
    ),
  );
}

/**
 * Rejects a navigation whose network activity contradicts its verified cache
 * state. Warm navigation must not request the route and cold navigation must.
 * Prefetch navigation records what Next requested without a requirement.
 */
function verifyCacheUse(cache, beforeRequests, requestCount) {
  if (
    (cache === 'cold' && requestCount === beforeRequests) ||
    (cache === 'warm' && requestCount !== beforeRequests)
  )
    throw new Error(`Navigation did not use verified ${cache} router cache`);
}

/** Reads route fetch timings on the page clock used by the input timestamps. */
function readRouteTimings(page) {
  return page.evaluate(
    (path) =>
      performance
        .getEntriesByType('resource')
        .filter((entry) => new URL(entry.name).pathname === path)
        .map((entry) => ({
          start: entry.startTime,
          responseEnd: entry.responseEnd,
        })),
    TARGET_PATH,
  );
}

/**
 * Measures one real mouse navigation in a fresh context with a verified router
 * cache. Timings are pointerdown to destination client layout effect
 * (`navigation`), pointerdown to pointerup (`pressDuration`), and pointerup to
 * destination commit (`releaseToCommit`, negative when committed before release).
 * The destination commit is not a paint timestamp.
 */
export async function measureNavigation(
  openPage,
  { variant, mode, cache, holdMs, batch, sample },
) {
  const { context, page } = await openPage();
  try {
    const routeRequests = [];
    page.on('request', (request) => {
      if (isRouteRequest(request)) routeRequests.push(request);
    });
    const beforeRequests = await prepareCache(page, cache, routeRequests, () =>
      page.evaluate(
        (input) =>
          window.benchmark.navigation(
            input.variant,
            input.mode,
            input.cache === 'prefetch',
          ),
        { variant, mode, cache },
      ),
    );
    const historyBefore = await page.evaluate(() => history.length);
    await pressAndWait(page, holdMs);
    await requireCompletedRequests(routeRequests);
    const observed = await page.evaluate(() => ({
      ...window.benchmark.events,
      preparation: window.benchmark.preparation,
      destination: window.benchmarkDestination,
      history: history.length,
      text: document.querySelector('[data-benchmark-destination]')?.textContent,
    }));
    const routeTimings = await readRouteTimings(page);
    const expected = expectedNavigation(variant, mode);
    const correct = navigationCorrect(observed, expected, historyBefore);

    verifyCacheUse(cache, beforeRequests, routeRequests.length);

    const metric = (value, signed = false) => ({
      value,
      unit: 'ms',
      correct,
      ...(signed && { signed }),
    });
    return {
      metrics: {
        navigation: metric(observed.destination.committed - observed.start),
        pressDuration: metric(observed.release - observed.start),
        releaseToCommit: metric(
          observed.destination.committed - observed.release,
          true,
        ),
      },
      check: {
        variant,
        mode: variant === 'next' ? null : mode,
        cache,
        holdMs,
        batch,
        sample,
        correct,
        beforeRequests,
        navigationRequests: routeRequests.length - beforeRequests,
        routeTimings,
        ...observed,
      },
    };
  } finally {
    await context.close();
  }
}

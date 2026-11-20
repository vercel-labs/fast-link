import { setTimeout as delay } from 'node:timers/promises';

// Fixture hrefs below the `/docs` base path. The dynamic destination renders
// per request after a fixed server delay, so its prefetch carries no page data.
const DESTINATION_HREFS = Object.freeze({
  static: '/benchmark/target',
  dynamic: '/benchmark/dynamic',
});
const BASE_PATH = '/docs';
// Bounds waits for request outcomes and network quiet.
const SETTLE_TIMEOUT_MS = 15000;
// See waitForQuietNetwork.
const QUIET_MS = 50;

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

function isRouteRequest(request, path) {
  return (
    new URL(request.url()).pathname === path && request.headers().rsc === '1'
  );
}

/**
 * Waits for a successful route response. A static destination's response must
 * contain destination content; a dynamic prefetch carries none.
 */
function waitForPrefetchResponse(page, destination) {
  return page.waitForResponse(
    async (response) =>
      isRouteRequest(response.request(), destination.path) &&
      response.ok() &&
      (destination.name === 'dynamic' ||
        (await response.text()).includes('data-benchmark-destination')),
  );
}

/**
 * Records the outcome of each request the page starts after this call.
 * `settled(request)` resolves to its failure text, or `null` once it finished,
 * and rejects after SETTLE_TIMEOUT_MS. `pending` holds requests in flight.
 */
function trackRequests(page) {
  const outcomes = new Map();
  const pending = new Set();
  const outcome = (request) => {
    if (!outcomes.has(request)) outcomes.set(request, Promise.withResolvers());
    return outcomes.get(request);
  };
  page.on('request', (request) => {
    outcome(request);
    pending.add(request);
  });
  page.on('requestfinished', (request) => {
    pending.delete(request);
    outcome(request).resolve(null);
  });
  page.on('requestfailed', (request) => {
    pending.delete(request);
    outcome(request).resolve(request.failure()?.errorText ?? 'failed');
  });

  async function settled(request) {
    let timer;
    try {
      return await Promise.race([
        outcome(request).promise,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Request did not settle: ${request.url()}`)),
            SETTLE_TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  return { pending, settled };
}

/**
 * Waits until no request has been in flight for QUIET_MS. On a delayed
 * network, a prefetch response starts the destination's client chunk request
 * only after it arrives; pressing during that load would time the chunk rather
 * than the navigation. The window covers the gap between a response and the
 * requests its processing starts, not requests started later.
 */
async function waitForQuietNetwork(pending) {
  const deadline = performance.now() + SETTLE_TIMEOUT_MS;
  let quietSince = performance.now();
  while (performance.now() - quietSince < QUIET_MS) {
    if (performance.now() > deadline)
      throw new Error('Network did not become idle before press');
    if (pending.size) quietSince = performance.now();
    // oxlint-disable-next-line no-await-in-loop -- Poll until the network stays quiet.
    await delay(5);
  }
}

/**
 * Establishes and verifies the pre-press router cache:
 * - warm: public `router.prefetch` delivered a route response;
 * - cold: no route request;
 * - prefetch: the rendered link's default Next prefetch delivered a route response.
 * Static responses must contain destination content. With `settleNetwork`,
 * also waits for network quiet. Returns how many route requests were made
 * before pressing and how many of those ended aborted.
 */
async function prepareCache(
  page,
  { cache, destination, settleNetwork },
  { routeRequests, requests },
  render,
) {
  const prefetched =
    cache === 'cold' ? null : waitForPrefetchResponse(page, destination);
  await render();
  if (cache === 'warm')
    await page.evaluate(
      (href) => window.benchmark.prefetch(href),
      destination.href,
    );
  if (prefetched)
    await requireRouteResponses(
      [(await prefetched).request()],
      requests,
      destination.name,
    );
  if (settleNetwork) await waitForQuietNetwork(requests.pending);
  const abortedRequests = await requireRouteResponses(
    routeRequests,
    requests,
    destination.name,
  );
  const beforeRequests = routeRequests.length;
  if (
    (cache === 'cold' && beforeRequests !== 0) ||
    (cache !== 'cold' && beforeRequests === 0)
  )
    throw new Error(`Unverified ${cache} cache state`);
  return { beforeRequests, abortedRequests };
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

/**
 * Requires a successful response for each route request and that the request
 * finished; returns how many ended aborted instead. Chromium reports dynamic
 * route requests as `net::ERR_ABORTED` after their successful response, for
 * Next Link, release and immediate, with or without network delay. Only that
 * abort is tolerated. The one-request check in `verifyCacheUse` can't tell
 * whether a prefetch was used, because a dynamic navigation makes one request
 * either way; `beforeAborts` records aborted prefetches. `route` is `static` or
 * `dynamic`.
 */
export async function requireRouteResponses(routeRequests, requests, route) {
  const failures = await Promise.all(
    routeRequests.map(async (request) => {
      const failure = await requests.settled(request);
      if (!(await request.response())?.ok())
        throw new Error('Benchmark route response failed');
      const isToleratedAbort =
        route === 'dynamic' && failure === 'net::ERR_ABORTED';
      if (failure && !isToleratedAbort)
        throw new Error(`Benchmark route request failed: ${failure}`);
      return failure;
    }),
  );
  return failures.filter(Boolean).length;
}

/**
 * Rejects a navigation whose network activity contradicts its verified cache
 * state. A dynamic navigation must request the route exactly once, whatever
 * the cache case, because its prefetch carries no page data. Otherwise warm
 * navigation must not request the route and cold navigation must. Static
 * prefetch navigation records what Next requested without a requirement.
 */
export function verifyCacheUse(cache, route, beforeRequests, requestCount) {
  const navigationRequests = requestCount - beforeRequests;
  if (route === 'dynamic') {
    if (navigationRequests !== 1)
      throw new Error(
        `Dynamic navigation made ${navigationRequests} route requests`,
      );
    return;
  }
  if (
    (cache === 'cold' && requestCount === beforeRequests) ||
    (cache === 'warm' && requestCount !== beforeRequests)
  )
    throw new Error(`Navigation did not use verified ${cache} router cache`);
}

/** Reads route fetch timings on the page clock used by the input timestamps. */
function readRouteTimings(page, routePath) {
  return page.evaluate(
    (path) =>
      performance
        .getEntriesByType('resource')
        .filter((entry) => new URL(entry.name).pathname === path)
        .map((entry) => ({
          start: entry.startTime,
          responseEnd: entry.responseEnd,
        })),
    routePath,
  );
}

/**
 * Measures one real mouse navigation in a fresh context with a verified router
 * cache. Timings are pointerdown to destination client layout effect
 * (`navigation`), pointerdown to pointerup (`pressDuration`), and pointerup to
 * destination commit (`releaseToCommit`, negative when committed before release).
 * The destination commit is not a paint timestamp. The `destination` option
 * names the route, `static` or `dynamic`; `settleNetwork` waits for network
 * quiet before pressing.
 */
export async function measureNavigation(
  openPage,
  {
    variant,
    mode,
    cache,
    holdMs,
    destination: route = 'static',
    settleNetwork = false,
    batch,
    sample,
  },
) {
  const href = DESTINATION_HREFS[route];
  const destination = { name: route, href, path: `${BASE_PATH}${href}` };
  const { context, page } = await openPage();
  try {
    const requests = trackRequests(page);
    const routeRequests = [];
    page.on('request', (request) => {
      if (isRouteRequest(request, destination.path))
        routeRequests.push(request);
    });
    const prepared = await prepareCache(
      page,
      { cache, destination, settleNetwork },
      { routeRequests, requests },
      () =>
        page.evaluate(
          (input) =>
            window.benchmark.navigation(
              input.variant,
              input.mode,
              input.cache === 'prefetch',
              input.href,
            ),
          { variant, mode, cache, href },
        ),
    );
    const { beforeRequests } = prepared;
    const historyBefore = await page.evaluate(() => history.length);
    await pressAndWait(page, holdMs);
    const navigationAborts = await requireRouteResponses(
      routeRequests.slice(beforeRequests),
      requests,
      route,
    );
    const observed = await page.evaluate(() => ({
      ...window.benchmark.events,
      preparation: window.benchmark.preparation,
      destination: window.benchmarkDestination,
      history: history.length,
      text: document.querySelector('[data-benchmark-destination]')?.textContent,
    }));
    const routeTimings = await readRouteTimings(page, destination.path);
    const expected = expectedNavigation(variant, mode);
    const correct = navigationCorrect(observed, expected, historyBefore);

    verifyCacheUse(cache, route, beforeRequests, routeRequests.length);

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
        route,
        holdMs,
        batch,
        sample,
        correct,
        beforeRequests,
        navigationRequests: routeRequests.length - beforeRequests,
        beforeAborts: prepared.abortedRequests,
        navigationAborts,
        routeTimings,
        ...observed,
      },
    };
  } finally {
    await context.close();
  }
}

/* oxlint-disable no-await-in-loop -- Browser interactions must run in order. */
import { setTimeout as delay } from 'node:timers/promises';

/** Matched fixture scenarios. Each source page has one link to `destination`. */
export const SCENARIOS = [
  { id: 'static', destination: '/soft-navigation/destination', cache: 'cold' },
  {
    id: 'prefetched',
    destination: '/soft-navigation/destination',
    cache: 'prefetched',
  },
  {
    id: 'delayed',
    destination: '/soft-navigation/delayed-destination',
    cache: 'cold',
  },
];

/**
 * Default mouse hold; shorter than the delayed destination's 500 ms delay. A
 * hold of 500 ms or more releases after that response, a different case.
 */
export const DEFAULT_HOLD_MS = 100;

/** Probe timing inputs, recorded with every report. */
export const TIMING = {
  // Chrome emits the entry after the destination's contentful paint.
  entryTimeoutMs: 3000,
  // Extra observation after the first entry, to catch duplicate entries.
  duplicateWindowMs: 1000,
  prefetchTimeoutMs: 10000,
  prefetchQuietMs: 300,
  navigationTimeoutMs: 10000,
};

const LINK_TEST_ID = 'soft-navigation-link';

/**
 * Opens one source page in a new context of a fresh browser, presses its link
 * with trusted mouse input and returns what Chrome and the page reported.
 */
export async function observeCase(
  browser,
  { origin, scenario, variant, holdMs },
) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
  });
  try {
    const page = await context.newPage();
    await page.addInitScript(instrumentPage, LINK_TEST_ID);
    const network = trackNetwork(page, `/docs${scenario.destination}`);
    const pageErrors = [];
    page.on('pageerror', (error) =>
      pageErrors.push(error.stack ?? error.message),
    );

    const sourceUrl = `${origin}/docs/soft-navigation/source/${scenario.id}/${variant}`;
    await page.goto(sourceUrl, { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.documentElement.dataset.softNavigationHydrated === 'true',
    );
    const cache = await settleCache(scenario, network);
    const before = await page.evaluate(() => ({
      url: location.href,
      historyLength: history.length,
    }));

    network.startInteraction();
    await press(page, holdMs);
    const destinationUrl = `${origin}/docs${scenario.destination}`;
    const navigationError = await waitForDestination(page, destinationUrl);
    await page
      .waitForFunction(
        (url) =>
          window.__softNavigationProbe.softNavigations.some(
            (entry) => entry.name === url,
          ),
        destinationUrl,
        { timeout: TIMING.entryTimeoutMs },
      )
      .catch(() => undefined);
    await delay(TIMING.duplicateWindowMs);

    const after = await page.evaluate(() => ({
      url: location.href,
      historyLength: history.length,
    }));
    const { pageLog, resources } = await page.evaluate(
      (path) => ({
        pageLog: window.__softNavigationProbe,
        resources: performance
          .getEntriesByType('resource')
          .filter((entry) => new URL(entry.name).pathname === path)
          .map((entry) => ({
            name: entry.name,
            startTime: entry.startTime,
            responseEnd: entry.responseEnd,
          })),
      }),
      `/docs${scenario.destination}`,
    );
    return {
      sourceUrl,
      destinationUrl,
      cache,
      before,
      after,
      navigationError,
      pageLog,
      resources,
      requests: network.requests,
      documentRequests: network.documentRequests(),
      pageErrors,
    };
  } finally {
    await context.close();
  }
}

/** Reads Chrome's identity, effective command line and soft-navigation support. */
export async function describeBrowser(browser, sourceUrl) {
  const session = await browser.newBrowserCDPSession();
  const { arguments: commandLine } = await session
    .send('Browser.getBrowserCommandLine')
    .catch((error) => ({ arguments: [`unavailable: ${error.message}`] }));
  const browserVersion = await session.send('Browser.getVersion');
  await session.detach();
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto('chrome://version');
    const chromeVersionPage = await page.locator('body').innerText();
    await page.goto(sourceUrl, { waitUntil: 'load' });
    const support = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      supportedEntryTypes: PerformanceObserver.supportedEntryTypes,
      softNavigationEntryType:
        PerformanceObserver.supportedEntryTypes.includes('soft-navigation'),
      softNavigationEntryInterface: 'SoftNavigationEntry' in window,
      interactionContentfulPaintEntryType:
        PerformanceObserver.supportedEntryTypes.includes(
          'interaction-contentful-paint',
        ),
      navigationApi: 'navigation' in window,
      // Interface names vary between Chrome releases; record what exists.
      relatedGlobals: Object.getOwnPropertyNames(window).filter((name) =>
        /SoftNavigation|InteractionContentfulPaint/.test(name),
      ),
    }));
    return {
      version: browser.version(),
      browserVersion,
      commandLine,
      chromeVersionPage,
      ...support,
    };
  } finally {
    await context.close();
  }
}

/**
 * Runs in every document before page scripts. Records pointer and click
 * events, Navigation API history changes, performance entries, and when the
 * destination content first appears. Must stay self-contained.
 */
function instrumentPage(linkTestId) {
  const log = {
    events: [],
    navigations: [],
    entryChanges: [],
    softNavigations: [],
    interactionPaints: [],
    eventTimings: [],
    destination: null,
    observerErrors: [],
  };
  Object.defineProperty(window, '__softNavigationProbe', { value: log });
  const linkSelector = `[data-testid="${linkTestId}"]`;

  for (const type of ['pointerdown', 'pointerup', 'click']) {
    let current;
    addEventListener(
      type,
      (event) => {
        current = {
          type,
          time: performance.now(),
          timeStamp: event.timeStamp,
          isTrusted: event.isTrusted,
          button: event.button,
          pointerType: event.pointerType ?? null,
          onLink:
            event.target instanceof Element &&
            event.target.closest(linkSelector) !== null,
          // Null when propagation stops before the window bubble listener.
          defaultPrevented: null,
        };
        log.events.push(current);
      },
      true,
    );
    addEventListener(type, (event) => {
      if (current) current.defaultPrevented = event.defaultPrevented;
    });
  }

  if ('navigation' in window) {
    navigation.addEventListener('navigate', (event) =>
      log.navigations.push({
        time: performance.now(),
        navigationType: event.navigationType,
        url: event.destination.url,
        userInitiated: event.userInitiated,
      }),
    );
    navigation.addEventListener('currententrychange', (event) =>
      log.entryChanges.push({
        time: performance.now(),
        url: location.href,
        navigationType: event.navigationType,
      }),
    );
  }

  // oxlint-disable-next-line consistent-function-scoping -- Playwright serializes only this function into the page.
  const serialize = (entry) => {
    const json = entry.toJSON();
    if (typeof entry.getLargestInteractionContentfulPaint === 'function') {
      const largest = entry.getLargestInteractionContentfulPaint();
      json.largestInteractionContentfulPaint = largest
        ? largest.toJSON()
        : null;
    }
    return json;
  };
  const observe = (type, target, options) => {
    if (!PerformanceObserver.supportedEntryTypes.includes(type)) return;
    try {
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) target.push(serialize(entry));
      }).observe({ type, buffered: true, ...options });
    } catch (error) {
      log.observerErrors.push(`${type}: ${error}`);
    }
  };
  observe('soft-navigation', log.softNavigations);
  observe('interaction-contentful-paint', log.interactionPaints);
  // Event Timing reports only events lasting at least 16 ms.
  observe('event', log.eventTimings, { durationThreshold: 16 });

  new MutationObserver((_records, observer) => {
    if (!document.querySelector('[data-soft-navigation-destination]')) return;
    log.destination = { time: performance.now(), url: location.href };
    observer.disconnect();
  }).observe(document, { childList: true, subtree: true });
}

// Records destination route requests and main-frame document requests.
function trackNetwork(page, destinationPath) {
  const requests = [];
  const pending = new Set();
  let phase = 'load';
  let initialDocumentRequests;
  page.on('request', (request) => {
    const isDocument =
      request.isNavigationRequest() && request.frame() === page.mainFrame();
    const isDestination = new URL(request.url()).pathname === destinationPath;
    if (!isDocument && !isDestination) return;
    const headers = request.headers();
    const record = {
      phase,
      url: request.url(),
      kind: isDocument ? 'document' : 'destination',
      rsc: headers.rsc ?? null,
      prefetch: headers['next-router-prefetch'] ?? null,
      segmentPrefetch: headers['next-router-segment-prefetch'] ?? null,
      status: null,
      failure: null,
    };
    requests.push(record);
    if (!isDestination) return;
    pending.add(request);
    request
      .response()
      .then((response) => {
        record.status = response?.status() ?? null;
      })
      .catch(() => undefined);
  });
  const settle = (request) => pending.delete(request);
  page.on('requestfinished', settle);
  page.on('requestfailed', (request) => {
    const record = requests.findLast((entry) => entry.url === request.url());
    if (record) record.failure = request.failure()?.errorText ?? 'failed';
    settle(request);
  });
  return {
    requests,
    pendingCount: () => pending.size,
    destinationCount: () =>
      requests.filter((entry) => entry.kind === 'destination').length,
    startInteraction() {
      phase = 'interaction';
      initialDocumentRequests = requests.filter(
        (entry) => entry.kind === 'document',
      ).length;
    },
    documentRequests: () =>
      requests.filter((entry) => entry.kind === 'document').length -
      initialDocumentRequests,
  };
}

// Waits for rendered-link prefetch to finish, or confirms no route request.
async function settleCache(scenario, network) {
  if (scenario.cache === 'cold')
    return {
      expected: 'cold',
      requestsBeforePress: network.destinationCount(),
      matched: network.destinationCount() === 0,
    };
  const deadline = performance.now() + TIMING.prefetchTimeoutMs;
  let quietSince;
  while (performance.now() < deadline) {
    const isQuiet =
      network.destinationCount() > 0 && network.pendingCount() === 0;
    quietSince = isQuiet ? (quietSince ?? performance.now()) : undefined;
    if (
      quietSince !== undefined &&
      performance.now() - quietSince >= TIMING.prefetchQuietMs
    )
      break;
    await delay(25);
  }
  return {
    expected: 'prefetched',
    requestsBeforePress: network.destinationCount(),
    matched:
      quietSince !== undefined &&
      performance.now() - quietSince >= TIMING.prefetchQuietMs &&
      network.pendingCount() === 0,
  };
}

async function press(page, holdMs) {
  const box = await page.getByTestId(LINK_TEST_ID).boundingBox();
  if (!box) throw new Error('Soft-navigation link is not visible');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await delay(holdMs);
  await page.mouse.up();
}

async function waitForDestination(page, destinationUrl) {
  try {
    await page.waitForURL(destinationUrl, {
      timeout: TIMING.navigationTimeoutMs,
    });
    await page.waitForFunction(
      () => window.__softNavigationProbe.destination !== null,
      undefined,
      { timeout: TIMING.navigationTimeoutMs },
    );
    return null;
  } catch (error) {
    return error.message;
  }
}

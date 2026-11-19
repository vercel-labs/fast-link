/*
 * Checks navigation-mode contracts in the built Next.js app with trusted mouse
 * input: closest-region ownership, mode and href changes during an interaction,
 * guard fallthrough, prefetch, and an immediate source that unmounts before its
 * follow-up click. Provider probes compare prepared release navigation with
 * ordinary Next Link through refresh, invalidation, redirects, and overlapping
 * navigation, and log both observations.
 */

/* oxlint-disable no-await-in-loop -- Browser interactions must run in order. */

import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

import { expect, test as base } from './test-fixtures.mjs';

const origin = process.env.FAST_LINK_FIXTURE_ORIGIN;
const hasPreparation = process.env.FAST_LINK_EXPECT_PREPARATION !== 'false';
const DESTINATION = '/docs/contracts/destination';
// Bounded windows for negative checks. A stray App Router navigation requests
// its route immediately; these windows do not prove it can never happen later.
const QUIET_MS = 750;

// WebKit reports a Next.js RSC fetch canceled by document navigation as an
// uncaught error. Only the destination's fetch can be in flight on the contracts
// page; allowed only where a case opts in, and each occurrence is logged.
const WEBKIT_CANCELED_RSC_FETCH = {
  browser: 'webkit',
  pattern:
    /\/docs\/contracts\/destination\?\S*_rsc=\S+ due to access control checks\.$/,
};

// Cases can expect uncaught errors, such as a throwing guard, or allow known
// browser reports.
const test = base.extend({
  expectedPageErrors: [[], { option: true }],
  allowedPageErrors: [[], { option: true }],
  pageErrors: [
    async ({ page, expectedPageErrors, allowedPageErrors }, use, testInfo) => {
      const errors = [];
      const onError = (error) => errors.push(error.message);
      page.on('pageerror', onError);
      try {
        await use(errors);
      } finally {
        page.off('pageerror', onError);
        if (errors.length) {
          await testInfo.attach('page-errors', {
            body: JSON.stringify(errors, null, 2),
            contentType: 'application/json',
          });
        }
        const isAllowed = (message) =>
          allowedPageErrors.some(
            ({ browser, pattern }) =>
              browser === testInfo.project.name && pattern.test(message),
          );
        if (allowedPageErrors.length)
          logObservation({ allowedPageErrors: errors.filter(isAllowed) });
        expect(
          errors.filter((message) => !isAllowed(message)),
          'browser errors',
        ).toEqual(expectedPageErrors);
      }
    },
    { auto: true },
  ],
});

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__fixturePresses = 0;
    document.addEventListener('pointerdown', () => window.__fixturePresses++);
  });
});

test('router preparation availability matches the runtime', async ({
  page,
}) => {
  await open(page, '/contracts', 'contracts-ready');
  assert.equal(
    await page.evaluate(() =>
      window.__contracts.get('runtime').hasPreparation(),
    ),
    hasPreparation,
  );
});

test.describe('closest region ownership', () => {
  test('an immediate region inside a release region uses its own document policy on press', async ({
    page,
  }) => {
    await open(page, '/contracts', 'contracts-ready');
    const requests = countRequests(page, DESTINATION);
    await press(page, 'inner-immediate');
    try {
      await page.waitForURL(destinationUrl('inner-immediate'));
    } finally {
      await page.mouse.up();
    }
    await expectDestination(page, 'inner-immediate');
    assert.deepEqual(await readLog(page), [
      'inner-immediate:policy',
      'inner-immediate:observe:document',
    ]);
    assert.equal(requests.document, 1);
  });

  test('a release region inside a native region prepares, then navigates on release', async ({
    page,
  }) => {
    await open(page, '/contracts', 'contracts-ready');
    const history = await historyLength(page);
    const requests = countRequests(page, DESTINATION);
    const prepared = page.waitForRequest(isDestination);
    prepared.catch(() => undefined);
    await press(page, 'inner-release');
    if (hasPreparation) await prepared;
    assert.equal(new URL(page.url()).pathname, '/docs/contracts');
    assert.equal(requests.route, hasPreparation ? 1 : 0);
    await page.mouse.up();
    await expectDestination(page, 'inner-release');
    assert.deepEqual(await readLog(page), [
      ...(hasPreparation ? ['inner-release:policy'] : []),
      'inner-release:policy',
      'inner-release:observe:router',
    ]);
    assert.deepEqual(
      { route: requests.route, document: requests.document },
      { route: 1, document: 0 },
    );
    assert.equal(await historyLength(page), history + 1);
  });

  for (const testId of ['outer-native', 'managed-native']) {
    test(`${testId}: Next Link routes on release without Fast Link work`, async ({
      page,
    }) => {
      await open(page, '/contracts', 'contracts-ready');
      const history = await historyLength(page);
      const requests = countRequests(page, DESTINATION);
      await press(page, testId);
      assert.equal(requests.route, 0, 'no work on press');
      await page.mouse.up();
      await expectDestination(page, testId);
      assert.deepEqual(await readLog(page), []);
      assert.deepEqual(
        { route: requests.route, document: requests.document },
        { route: 1, document: 0 },
      );
      assert.equal(await historyLength(page), history + 1);
    });
  }

  test('an immediate link inside a release region keeps its own mode and suppresses the follow-up click', async ({
    page,
  }) => {
    await open(page, '/contracts', 'contracts-ready');
    const requests = countRequests(page, DESTINATION);
    const gate = await holdDestination(page);
    try {
      const requested = page.waitForRequest(isDestination);
      requested.catch(() => undefined);
      await press(page, 'managed-immediate');
      await requested;
      assert.equal(new URL(page.url()).pathname, '/docs/contracts');
      await page.mouse.up();
      await expectLog(page, [
        'managed-immediate:policy',
        'managed-immediate:observe:router',
        'managed-immediate:click:prevented',
      ]);
    } finally {
      gate.resolve();
    }
    await expectDestination(page, 'managed-immediate');
    assert.deepEqual(
      { route: requests.route, document: requests.document },
      { route: 1, document: 0 },
    );
  });

  test('releasing away from a release region link cancels navigation', async ({
    page,
  }) => {
    await open(page, '/contracts', 'contracts-ready');
    const requests = countRequests(page, DESTINATION);
    const prepared = page.waitForRequest(isDestination);
    prepared.catch(() => undefined);
    await press(page, 'region-release-away');
    if (hasPreparation) await prepared;
    await page.mouse.move(1, 1);
    await page.mouse.up();
    await delay(QUIET_MS);
    assert.equal(new URL(page.url()).pathname, '/docs/contracts');
    assert.deepEqual(
      await readLog(page),
      hasPreparation ? ['outer-release:policy'] : [],
    );
    assert.equal(requests.route, hasPreparation ? 1 : 0);
  });
});

test.describe('immediate mode with a mounted source', () => {
  for (const [name, change, expectedHref] of [
    [
      'a mode change to native after acceptance',
      (id) => window.__contracts.get(id).setMode('native'),
      null,
    ],
    [
      'an href change after acceptance',
      (id) =>
        window.__contracts
          .get(id)
          .setHref('/contracts/destination?from=changed'),
      '/docs/contracts/destination?from=changed',
    ],
  ]) {
    test(`${name} keeps the follow-up click suppressed`, async ({ page }) => {
      await open(page, '/contracts', 'contracts-ready');
      const requests = countRequests(page, DESTINATION);
      const gate = await holdDestination(page);
      const source = page.getByTestId('immediate-plain');
      try {
        const requested = page.waitForRequest(isDestination);
        requested.catch(() => undefined);
        await press(page, 'immediate-plain');
        await requested;
        await page.evaluate(change, 'immediate-plain');
        if (expectedHref)
          await expect(source).toHaveAttribute('href', expectedHref);
        else await expect(source).toHaveAttribute('data-mode', 'native');
        await page.mouse.up();
        await expectLog(page, [
          'immediate-plain:guard',
          'immediate-plain:policy',
          'immediate-plain:observe:router',
          'immediate-plain:click:prevented',
        ]);
      } finally {
        gate.resolve();
      }
      await expectDestination(page, 'immediate-plain');
      assert.deepEqual(
        { route: requests.route, document: requests.document },
        { route: 1, document: 0 },
      );
    });
  }

  test('releasing away after an immediate press still navigates once', async ({
    page,
  }) => {
    await open(page, '/contracts', 'contracts-ready');
    const history = await historyLength(page);
    const requests = countRequests(page, DESTINATION);
    const gate = await holdDestination(page);
    try {
      const requested = page.waitForRequest(isDestination);
      requested.catch(() => undefined);
      await press(page, 'immediate-plain');
      await requested;
      await page.mouse.move(1, 1);
      await page.mouse.up();
    } finally {
      gate.resolve();
    }
    await expectDestination(page, 'immediate-plain');
    assert.deepEqual(await readLog(page), [
      'immediate-plain:guard',
      'immediate-plain:policy',
      'immediate-plain:observe:router',
    ]);
    assert.equal(requests.route, 1);
    assert.equal(await historyLength(page), history + 1);
  });

  for (const [testId, errors] of [
    ['immediate-cancel', []],
    ['immediate-throw', ['immediate-throw: guard failure']],
    ['immediate-to-native', []],
  ]) {
    test.describe(() => {
      test.use({ expectedPageErrors: errors });
      test(`${testId}: the follow-up click stays suppressed and nothing navigates`, async ({
        page,
      }) => {
        await open(page, '/contracts', 'contracts-ready');
        const requests = countRequests(page, DESTINATION);
        await press(page, testId);
        await page.mouse.up();
        await expectLog(page, [`${testId}:guard`, `${testId}:click:prevented`]);
        await delay(QUIET_MS);
        assert.equal(new URL(page.url()).pathname, '/docs/contracts');
        assert.equal(requests.route, 0);
        if (testId === 'immediate-to-native')
          await expect(page.getByTestId(testId)).toHaveAttribute(
            'data-mode',
            'native',
          );
      });
    });
  }
});

test.describe('release mode changes before acceptance', () => {
  for (const [name, modes] of [
    ['switching to native', ['native']],
    ['switching to native and back', ['native', 'release']],
  ]) {
    test(`${name} while held leaves the click to Next Link`, async ({
      page,
    }) => {
      await open(page, '/contracts', 'contracts-ready');
      const history = await historyLength(page);
      const requests = countRequests(page, DESTINATION);
      const prepared = page.waitForRequest(isDestination);
      prepared.catch(() => undefined);
      await press(page, 'release-plain');
      if (hasPreparation) await prepared;
      for (const mode of modes) {
        await page.evaluate(
          (next) => window.__contracts.get('release-plain').setMode(next),
          mode,
        );
        await expect(page.getByTestId('release-plain')).toHaveAttribute(
          'data-mode',
          mode,
        );
      }
      await page.mouse.up();
      await expectDestination(page, 'release-plain');
      assert.deepEqual(await readLog(page), [
        ...(hasPreparation ? ['release-plain:policy'] : []),
        'release-plain:click:allowed',
        'release-plain:guard',
      ]);
      assert.equal(requests.document, 0);
      assert.equal(await historyLength(page), history + 1);
      logObservation({ destinationRequests: requests.route });
    });
  }

  test('a FastLink guard that switches to native falls through to Next Link', async ({
    page,
  }) => {
    await open(page, '/contracts', 'contracts-ready');
    const history = await historyLength(page);
    const requests = countRequests(page, DESTINATION);
    await press(page, 'release-to-native');
    await page.mouse.up();
    await expectDestination(page, 'release-to-native');
    assert.deepEqual(await readLog(page), [
      ...(hasPreparation ? ['release-to-native:policy'] : []),
      'release-to-native:click:allowed',
      'release-to-native:guard',
    ]);
    assert.equal(requests.document, 0);
    assert.equal(await historyLength(page), history + 1);
    logObservation({ destinationRequests: requests.route });
  });

  test('a custom hook capture guard that switches to native falls through to the renderer', async ({
    page,
  }) => {
    await open(page, '/contracts', 'contracts-ready');
    const history = await historyLength(page);
    const requests = countRequests(page, DESTINATION);
    await press(page, 'hook-to-native');
    await page.mouse.up();
    await expectDestination(page, 'hook-to-native');
    // The renderer runs its own guards after the hook's guards, as documented.
    assert.deepEqual(await readLog(page), [
      ...(hasPreparation ? ['hook-to-native:policy'] : []),
      'hook-to-native:capture',
      'hook-to-native:hook-guard',
      'hook-to-native:link-guard',
    ]);
    assert.equal(requests.document, 0);
    assert.equal(await historyLength(page), history + 1);
  });
});

test.describe('prefetch', () => {
  for (const testId of ['prefetch-release', 'prefetch-immediate']) {
    test(`${testId}: navigates through the router after Next prefetches`, async ({
      page,
    }) => {
      const requests = countRequests(page, '/docs/contracts/static');
      const prefetched = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/docs/contracts/static',
      );
      prefetched.catch(() => undefined);
      await open(page, '/contracts/prefetch', 'prefetch-ready');
      await page.getByTestId(testId).scrollIntoViewIfNeeded();
      await (await prefetched).finished();
      const prefetchRequests = requests.route;
      const history = await historyLength(page);
      const documents = requests.document;
      await press(page, testId);
      await page.mouse.up();
      await page.waitForURL(`${origin}/docs/contracts/static?from=${testId}`);
      await expect(
        page.getByRole('heading', { name: 'Contract static destination' }),
      ).toBeVisible();
      assert.equal(requests.document, documents);
      assert.equal(await historyLength(page), history + 1);
      assert.deepEqual(
        (await readLog(page)).filter((entry) => entry.includes(':observe:')),
        [`${testId}:observe:router`],
      );
      logObservation({
        prefetchRequests,
        navigationRequests: requests.route - prefetchRequests,
        log: await readLog(page),
      });
    });
  }
});

test.describe('prefetch enabled during the guard', () => {
  test.use({ allowedPageErrors: [WEBKIT_CANCELED_RSC_FETCH] });

  test('enable-next-link-document: ordinary Next Link control completes one document navigation', async ({
    page,
  }) => {
    await open(page, '/contracts', 'contracts-ready');
    const history = await historyLength(page);
    const requests = countRequests(page, DESTINATION);
    await press(page, 'enable-next-link-document');
    await page.mouse.up();
    await expectDestination(page, 'enable-next-link-document');
    assert.deepEqual(await readLog(page), ['enable-next-link-document:guard']);
    assert.equal(requests.document, 1);
    assert.equal(await historyLength(page), history + 1);
    logObservation({ destinationRequests: requests.route });
  });

  for (const [testId, mode, kind] of [
    ['enable-release-document', 'release', 'document'],
    ['enable-release-router', 'release', 'router'],
    ['enable-immediate-document', 'immediate', 'document'],
    ['enable-immediate-router', 'immediate', 'router'],
  ]) {
    test(`${testId}: completes one ${kind} navigation`, async ({ page }) => {
      await open(page, '/contracts', 'contracts-ready');
      const history = await historyLength(page);
      const requests = countRequests(page, DESTINATION);
      await press(page, testId);
      if (mode === 'immediate') {
        try {
          await page.waitForURL(destinationUrl(testId));
        } finally {
          await page.mouse.up();
        }
      } else {
        await page.mouse.up();
      }
      await expectDestination(page, testId);
      assert.deepEqual(await readLog(page), [
        ...(mode === 'release' && hasPreparation ? [`${testId}:policy`] : []),
        `${testId}:guard`,
        `${testId}:policy`,
        `${testId}:observe:${kind}`,
      ]);
      assert.equal(requests.document, kind === 'document' ? 1 : 0);
      assert.equal(await historyLength(page), history + 1);
      logObservation({ destinationRequests: requests.route });
    });
  }
});

test.describe('immediate source unmounted before its follow-up click', () => {
  for (const [testId, index] of [
    ['unmount-link', 0],
    ['unmount-region', 1],
  ]) {
    test(`${testId}: the follow-up click does not navigate from the destination`, async ({
      page,
    }) => {
      await open(page, '/contracts/unmount', 'unmount-ready');
      const history = await historyLength(page);
      const requests = countRequests(page, DESTINATION);
      await press(page, testId);
      const from = testId === 'unmount-link' ? 'link' : 'region';
      try {
        await page.waitForURL(
          `${origin}/docs/contracts/unmount/landing?from=${from}`,
        );
        await expect(
          page.getByRole('heading', { name: 'Unmount landing' }),
        ).toBeVisible();
        await expect(page.getByTestId('unmount-ready')).toHaveAttribute(
          'data-ready',
          'true',
        );
        await expect(page.getByTestId(`landing-${index}`)).toBeVisible();
      } finally {
        await page.mouse.up();
      }
      await delay(QUIET_MS);
      const log = await readLog(page);
      logObservation({ log });
      assert.equal(
        page.url(),
        `${origin}/docs/contracts/unmount/landing?from=${from}`,
        'the follow-up click navigated again',
      );
      assert.equal(requests.route, 0, 'landing link activated');
      assert.equal(await historyLength(page), history + 1);
      // Control: a complete click at the same position activates the landing link.
      await page.mouse.down();
      await page.mouse.up();
      await expectDestination(page, `landing-${index}`);
    });
  }
});

test.describe('provider probes against ordinary Next Link', () => {
  for (const [name, scenario] of [
    ['router refresh while held', refreshWhileHeld],
    ['cache invalidation while held', invalidateWhileHeld],
    ['a navigation committed while held', pushWhileHeld],
    [
      'a navigation started while the accepted one is pending',
      pushWhilePending,
    ],
  ]) {
    test(`${name}: release matches Next Link routing`, async ({ page }) => {
      const release = await scenario(page, 'prepared');
      const nextLink = await scenario(page, 'next-link');
      logObservation({ release, nextLink });
      for (const observation of [release, nextLink])
        assert.equal(observation.documentRequests, 0);
      assert.equal(release.url, nextLink.url, 'final URL');
      assert.equal(release.historyDelta, nextLink.historyDelta, 'history');
    });
  }

  test('a redirecting destination ends where Next Link ends', async ({
    page,
  }) => {
    const observations = {};
    for (const testId of [
      'redirect',
      'redirect-immediate',
      'redirect-next-link',
    ]) {
      await open(page, '/contracts/provider', 'provider-ready');
      const history = await historyLength(page);
      const redirects = countRequests(page, '/docs/contracts/redirect');
      const destinations = countRequests(page, DESTINATION);
      await press(page, testId);
      await page.mouse.up();
      await page.waitForURL(destinationUrl('redirect'));
      await expect(page.getByTestId('destination-from')).toHaveText('redirect');
      observations[testId] = {
        historyDelta: (await historyLength(page)) - history,
        documentRequests: redirects.document,
        redirectRequests: redirects.route,
        destinationRequests: destinations.route,
      };
      redirects.stop();
      destinations.stop();
    }
    logObservation(observations);
    for (const observation of Object.values(observations)) {
      assert.equal(observation.documentRequests, 0);
      assert.equal(
        observation.historyDelta,
        observations['redirect-next-link'].historyDelta,
      );
    }
  });
});

async function refreshWhileHeld(page, testId) {
  return probe(page, testId, async () => {
    await page.evaluate(() => window.__contracts.get('provider').refresh());
    await waitForResponseEnd(page, '/docs/contracts/provider');
    await page.mouse.up();
    await expectDestination(page, testId);
  });
}

async function invalidateWhileHeld(page, testId) {
  let invalidatedAt;
  const observation = await probe(page, testId, async () => {
    invalidatedAt = await page.evaluate(() =>
      window.__contracts.get('provider').invalidate(),
    );
    await page.mouse.up();
    await expectDestination(page, testId);
  });
  const renderedAt = Number(
    await page.getByTestId('rendered-at').textContent(),
  );
  return {
    ...observation,
    renderedBeforeInvalidation: renderedAt < invalidatedAt,
  };
}

async function pushWhileHeld(page, testId) {
  return probe(page, testId, async () => {
    await page.evaluate(() =>
      window.__contracts.get('provider').push('/contracts/provider?step=b'),
    );
    await expect(page.getByTestId('provider-step')).toHaveText('b');
    await page.mouse.up();
    await expectDestination(page, testId);
  });
}

async function pushWhilePending(page, testId) {
  const gate = await holdDestination(page);
  try {
    return await probe(
      page,
      testId,
      async () => {
        await page.mouse.up();
        if (testId === 'prepared')
          await expect
            .poll(() => readLog(page))
            .toEqual(['prepared:observe:router']);
        await page.evaluate(() =>
          window.__contracts.get('provider').push('/contracts/provider?step=b'),
        );
        await expect(page.getByTestId('provider-step')).toHaveText('b');
        // Read the URL only after the held destination responses settle.
        await gate.release();
      },
      { awaitResponse: false },
    );
  } finally {
    gate.resolve();
    await page.unrouteAll({ behavior: 'ignoreErrors' });
  }
}

// Opens the provider page, presses, waits for preparation, then runs the scenario.
async function probe(page, testId, scenario, { awaitResponse = true } = {}) {
  await open(page, '/contracts/provider', 'provider-ready');
  await page.evaluate(() => sessionStorage.removeItem('contracts-log'));
  const history = await historyLength(page);
  const requests = countRequests(page, DESTINATION);
  const requested = page.waitForRequest(isDestination);
  requested.catch(() => undefined);
  try {
    await press(page, testId);
    if (testId === 'prepared' && hasPreparation) {
      await requested;
      if (awaitResponse) await waitForResponseEnd(page, DESTINATION);
    }
    await scenario();
    return {
      // Each link names itself in `from`; compare the remaining URL.
      url: page.url().replace(`from=${testId}`, 'from=<source>'),
      historyDelta: (await historyLength(page)) - history,
      documentRequests: requests.document,
      destinationRequests: requests.route,
      log: await readLog(page),
    };
  } finally {
    await page.mouse.up().catch(() => undefined);
    requests.stop();
  }
}

// Resource timing confirms the body completed, including streamed RSC responses.
async function waitForResponseEnd(page, pathname) {
  await page.waitForFunction(
    (path) =>
      performance
        .getEntriesByType('resource')
        .some(
          (entry) =>
            new URL(entry.name).pathname === path && entry.responseEnd > 0,
        ),
    pathname,
  );
}

async function open(page, path, readyTestId) {
  await page.goto(`${origin}/docs${path}`);
  await expect(page.getByTestId(readyTestId)).toHaveAttribute(
    'data-ready',
    'true',
  );
}

async function press(page, testId) {
  const target = page.getByTestId(testId);
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Missing ${testId}`);
  const before = await page.evaluate(() => ({
    presses: window.__fixturePresses,
    href: location.href,
  }));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Document bubbling follows the controllers' synchronous capture handlers.
  // A document navigation on press replaces the counter's page.
  await page.waitForFunction(
    ({ presses, href }) =>
      window.__fixturePresses !== presses || location.href !== href,
    before,
  );
}

// Holds destination responses until released so the source stays mounted.
async function holdDestination(page) {
  const gate = Promise.withResolvers();
  const held = new Map();
  await page.route(
    (url) => url.pathname === DESTINATION,
    async (route) => {
      const settled = Promise.withResolvers();
      held.set(route.request(), settled);
      await gate.promise;
      // A request the page canceled while held never reaches the network.
      await route.continue().catch(() => settled.resolve());
    },
  );
  return {
    resolve: gate.resolve,
    // Resolves once every held request has finished or failed.
    async release() {
      const settle = (request) => held.get(request)?.resolve();
      page.on('requestfinished', settle);
      page.on('requestfailed', settle);
      gate.resolve();
      try {
        await Promise.all([...held.values()].map(({ promise }) => promise));
      } finally {
        page.off('requestfinished', settle);
        page.off('requestfailed', settle);
      }
    },
  };
}

function countRequests(page, pathname) {
  const counts = {
    route: 0,
    document: 0,
    stop: () => page.off('request', onRequest),
  };
  function onRequest(request) {
    if (new URL(request.url()).pathname === pathname) counts.route++;
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      counts.document++;
  }
  page.on('request', onRequest);
  return counts;
}

function isDestination(requestOrResponse) {
  return new URL(requestOrResponse.url()).pathname === DESTINATION;
}

function destinationUrl(from) {
  return `${origin}${DESTINATION}?from=${from}`;
}

async function expectDestination(page, from) {
  await page.waitForURL(destinationUrl(from));
  await expect(page.getByTestId('destination-from')).toHaveText(from);
}

function historyLength(page) {
  return page.evaluate(() => history.length);
}

function readLog(page) {
  return page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('contracts-log') ?? '[]'),
  );
}

async function expectLog(page, entries) {
  await expect.poll(() => readLog(page)).toEqual(entries);
}

// Provider and request observations are evidence, not asserted guarantees.
function logObservation(observation) {
  const { title, project } = test.info();
  console.log(
    `[observation] ${project.name} | ${title} | ${JSON.stringify(observation)}`,
  );
}

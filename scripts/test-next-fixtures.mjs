/*
 * Runs the built Next.js app in real browsers to check navigation timing, native
 * activation, routing options, and policies. This verifies integration with Next
 * Link and App Router beyond what the mocked component tests can prove.
 */

/* oxlint-disable no-await-in-loop -- Fixture startup and browser interactions must run in order. */

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { test } from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { chromium, firefox, webkit } from 'playwright';

const version = 'next-16';
const port = await freePort();
const fixtureOrigin = `http://127.0.0.1:${port}`;
const serverProcess = spawn(
  process.execPath,
  [
    fileURLToPath(
      new URL(
        `../fixtures/${version}/node_modules/next/dist/bin/next`,
        import.meta.url,
      ),
    ),
    'start',
    '--hostname',
    '127.0.0.1',
    '--port',
    String(port),
  ],
  {
    cwd: fileURLToPath(new URL(`../fixtures/${version}/`, import.meta.url)),
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);
let output = '';
serverProcess.stdout.on('data', (data) => {
  output += data.toString();
});
serverProcess.stderr.on('data', (data) => {
  output += data.toString();
});

const scenarios = [
  [
    'prefetch respects explicit false with a cold positive control',
    (page) => checkPrefetch(page, fixtureOrigin),
  ],
  ...[
    ['fast', /\/docs\/fast\?from=home#destination$/],
    ['object', /\/docs\/object\?ref=a\+b$/],
  ].map(([testId, destination]) => [
    `${testId}: routes before release with one base path`,
    (page) => pressBeforeRelease(page, testId, destination),
  ]),
  [
    'onNavigate cancellation preserves click handlers',
    async (page) => {
      await page.getByTestId('cancel').click();
      await expectOutput(page, 'events', 'navigate,click');
      assert.equal(new URL(page.url()).pathname, '/docs');
    },
  ],
  ...[
    ['native', /\/docs\/fast$/],
    ['region-native', /\/docs\/fast\?from=keyboard$/],
    ['policy-owned', /\/docs\/fast\?owner=owned$/],
  ].map(([testId, destination]) => [
    `${testId}: keyboard activation stays native`,
    async (page) => {
      await page.getByTestId(testId).focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(destination);
      assert.equal(
        await page.evaluate(
          () => sessionStorage.getItem('policy-actions') ?? '0',
        ),
        '0',
      );
    },
  ]),
  ...['as', 'legacy'].map((testId) => [
    `${testId}: starts only after release`,
    (page) => pressAfterRelease(page, testId, /\/docs\/fast$/),
  ]),
  ['slow fast route starts while Link status stays idle', checkSlowStatus],
  [
    'inline ref churn preserves follow-up suppression',
    async (page) => {
      await pressAndHold(page, 'churn');
      await expectOutput(page, 'events', 'fast');
      assert.ok(
        Number(
          await page.getByTestId('churn').getAttribute('data-ref-calls'),
        ) >= 2,
      );
      await page.mouse.up();
      await expectOutput(page, 'events', 'fast,prevented');
      await page.waitForURL(/\/docs\/slow$/);
    },
  ],
  ...[
    ['capture-stop', /\/docs\/slow\?from=capture$/],
    ['closed-capture-host', /\/docs\/slow\?from=closed-capture$/],
  ].map(([testId, destination]) => [
    `${testId}: suppresses before stopping capture`,
    (page) => checkCaptureSuppression(page, testId, destination),
  ]),
  ...[
    ['options', /\/docs\/fast\?from=options$/, 'pointerdown'],
    ['region-options', /\/docs\/fast\?from=region-options$/, 'click'],
  ].map(([testId, destination, starts]) => [
    `${testId}: replaces history and preserves scroll`,
    (page) =>
      checkBrowserNavigation(page, {
        origin: fixtureOrigin,
        testId,
        destination,
        starts,
        history: 'replace',
        scroll: 'preserve',
      }),
  ]),
  [
    'ordinary region link pushes exactly one history entry',
    (page) =>
      checkBrowserNavigation(page, {
        origin: fixtureOrigin,
        testId: 'region-fast',
        destination: /\/docs\/fast\?from=region#destination$/,
        starts: 'pointerdown',
        history: 'push',
        kind: 'router',
      }),
  ],
  ...[
    ['region-cancel', 'region-click,region-cancel,region-parent'],
    ['region-guard', 'region-guard,region-parent'],
  ].map(([testId, events]) => [
    `${testId}: honors opted-out handlers`,
    async (page) => {
      await page.getByTestId(testId).click();
      await expectOutput(page, 'events', events);
      assert.equal(new URL(page.url()).pathname, '/docs');
    },
  ]),
  [
    'region rerender preserves pending suppression and idle Link status',
    async (page) => {
      await pressAndHold(page, 'region-churn');
      await expectOutput(page, 'events', 'region-fast');
      assert.equal(
        await page.getByTestId('region-pending').textContent(),
        'idle',
      );
      await page.mouse.up();
      await expectOutput(
        page,
        'events',
        'region-fast,region-prevented,region-parent',
      );
      await page.waitForURL(/\/docs\/slow$/);
    },
  ],
  ...[
    ['policy-owned', 'router', 'push'],
    ['policy-foreign', 'document', 'push'],
    ['policy-unknown', 'document', 'push'],
    ['policy-region-owned', 'router', 'push'],
    ['policy-region-foreign', 'document', 'push'],
    ['policy-region-unknown', 'document', 'push'],
    ['policy-router-replace', 'router', 'replace'],
    ['policy-document-replace', 'document', 'replace'],
  ].map(([testId, kind, history]) => [
    `${testId}: ${kind} ${history} with one policy action`,
    (page) =>
      checkBrowserNavigation(page, {
        origin: fixtureOrigin,
        testId,
        starts: 'pointerdown',
        kind,
        history,
        actions: 1,
      }),
  ]),
  ...['policy-disabled', 'policy-optout'].map((testId) => [
    `${testId}: bypasses early policy`,
    (page) => pressAfterRelease(page, testId, /\/docs\/fast\?owner=owned$/),
  ]),
  [
    'custom renderer preserves layout, ref, pending and click propagation',
    async (page) => {
      const pending = page.getByTestId('policy-pending');
      assert.equal(
        await pending.evaluate(
          (element) =>
            getComputedStyle(element.closest('nav').parentElement).display,
        ),
        'contents',
      );
      await pressAndHold(page, 'policy-pending');
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="policy-pending"]')
            ?.getAttribute('data-pending') === 'true',
      );
      assert.equal(await pending.getAttribute('data-attached'), 'true');
      await page.mouse.up();
      await expectOutput(
        page,
        'policy-events',
        'capture,click:prevented,bubble:prevented',
      );
      await page.waitForURL(/\/docs\/slow\?owner=owned$/);
    },
  ],
  ...[
    ['policy-keep-scroll', 'preserve'],
    ['policy-default-scroll', 'reset'],
    ['policy-region-keep-scroll', 'preserve'],
  ].map(([testId, scroll]) => [
    `${testId}: ${scroll} scroll`,
    (page) =>
      checkBrowserNavigation(page, {
        origin: fixtureOrigin,
        testId,
        starts: 'pointerdown',
        scroll,
      }),
  ]),
  [
    'region touch activation stays native',
    async (page) => {
      await dispatchTouchPress(page, 'region-native');
      assert.equal(new URL(page.url()).pathname, '/docs');
      assert.equal(await page.getByTestId('events').textContent(), '');
      await page.getByTestId('region-native').tap();
      await page.waitForURL(/\/docs\/fast\?from=keyboard$/);
    },
    { hasTouch: true },
  ],
  [
    'policy touch activation bypasses early policy',
    async (page) => {
      await dispatchTouchPress(page, 'policy-region-owned');
      assert.equal(
        await page.evaluate(
          () => sessionStorage.getItem('policy-actions') ?? '0',
        ),
        '0',
      );
      await page.getByTestId('policy-region-owned').tap();
      await page.waitForURL(/\/docs\/fast\?owner=owned$/);
      assert.equal(
        await page.evaluate(
          () => sessionStorage.getItem('policy-actions') ?? '0',
        ),
        '0',
      );
    },
    { hasTouch: true },
  ],
];

try {
  await waitForServer(`${fixtureOrigin}/docs`, serverProcess);
  await test('Next.js fixture browsers', { concurrency: true }, async (t) => {
    await Promise.all(
      Object.entries({ chromium, firefox, webkit }).map(([name, browserType]) =>
        t.test(name, { concurrency: 2 }, (browserTest) =>
          checkBrowser(browserType, browserTest),
        ),
      ),
    );
  });
} catch (error) {
  throw new Error(`${version} fixture failed:\n${output}`, { cause: error });
} finally {
  if (serverProcess.exitCode === null && serverProcess.signalCode === null) {
    const exited = once(serverProcess, 'exit');
    serverProcess.kill('SIGTERM');
    await exited;
  }
}
async function checkBrowser(browserType, t) {
  const browser = await browserType.launch();
  try {
    await Promise.all(
      scenarios.map(([name, run, options]) =>
        t.test(name, { timeout: 30000 }, async () => {
          const context = await browser.newContext(options);
          try {
            const page = await context.newPage();
            page.setDefaultTimeout(5000);
            page.setDefaultNavigationTimeout(10000);
            const errors = [];
            page.on('pageerror', (error) => errors.push(error.message));
            await page.addInitScript(() => {
              window.__fixturePresses = 0;
              document.addEventListener(
                'pointerdown',
                () => window.__fixturePresses++,
              );
            });
            await page.goto(`${fixtureOrigin}/docs`);
            await waitForHydration(page);
            await run(page);
            assert.deepEqual(errors, [], 'unexpected browser errors');
          } finally {
            await context.close();
          }
        }),
      ),
    );
  } finally {
    await browser.close();
  }
}

async function waitForHydration(page) {
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="closed-capture-host"]')
        ?.getAttribute('data-ready') === 'true',
  );
}

async function expectOutput(page, testId, text) {
  await page.waitForFunction(
    (expected) =>
      document.querySelector(`[data-testid="${expected.testId}"]`)
        ?.textContent === expected.text,
    { testId, text },
  );
}

async function pressAndHold(page, testId) {
  const target = page.getByTestId(testId);
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Missing ${testId}`);
  const before = await page.evaluate(() => window.__fixturePresses);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  // Document bubbling follows the controllers' synchronous capture handlers.
  await page.waitForFunction(
    (count) =>
      window.__fixturePresses === count + 1 || location.pathname !== '/docs',
    before,
  );
}

async function dispatchTouchPress(page, testId) {
  await page.getByTestId(testId).evaluate((element) =>
    element.dispatchEvent(
      new PointerEvent('pointerdown', {
        bubbles: true,
        button: 0,
        pointerType: 'touch',
      }),
    ),
  );
  // dispatchEvent returns after synchronous capture and bubble listeners finish.
}

async function checkSlowStatus(page) {
  const gate = Promise.withResolvers();
  await page.route('**/docs/slow?*', async (route) => {
    await gate.promise;
    await route.continue();
  });
  try {
    const requested = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/docs/slow',
    );
    // Observe rejection immediately if the positive signal fails first.
    requested.catch(() => undefined);
    await pressAndHold(page, 'slow');
    await expectOutput(page, 'events', 'slow-fast');
    await requested;
    assert.equal(
      new URL(page.url()).pathname,
      '/docs',
      'response must still be held',
    );
    assert.equal(await page.getByTestId('pending').textContent(), 'idle');
    await page.mouse.up();
  } finally {
    gate.resolve();
  }
  await page.waitForURL(/\/docs\/slow$/);
}

async function pressBeforeRelease(page, testId, destination) {
  await pressAndHold(page, testId);
  try {
    await page.waitForURL(destination);
  } finally {
    await page.mouse.up();
  }
}

async function checkCaptureSuppression(page, testId, destination) {
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="closed-capture-host"]')
        ?.getAttribute('data-ready') === 'true',
  );
  const target = page.getByTestId(testId);
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  if (!box) throw new Error(`Missing ${testId}`);
  let documentRequests = 0;
  const onRequest = (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame())
      documentRequests++;
  };
  page.on('request', onRequest);
  try {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="events"]')?.textContent ===
        'capture-fast',
    );
    await page.mouse.up();
    await page.waitForFunction(
      () =>
        document.querySelector('[data-testid="events"]')?.textContent ===
        'capture-fast,capture-prevented',
    );
    await page.waitForURL(destination);
    if (documentRequests !== 0)
      throw new Error(`${testId}: follow-up click activated the document`);
  } finally {
    page.off('request', onRequest);
  }
}

async function pressAfterRelease(page, testId, destination) {
  await pressAndHold(page, testId);
  assert.equal(
    new URL(page.url()).pathname,
    '/docs',
    `${testId}: navigated before release`,
  );
  assert.equal(
    await page.getByTestId('events').textContent(),
    '',
    `${testId}: fast navigation before release`,
  );
  assert.equal(
    await page.evaluate(() => sessionStorage.getItem('policy-actions') ?? '0'),
    '0',
    `${testId}: policy before release`,
  );
  await page.mouse.up();
  await page.waitForURL(destination);
}

async function checkBrowserNavigation(page, expectation) {
  const observation = await observeBrowserNavigation(page, expectation);
  assertBrowserNavigation(expectation, observation);
}

async function observeBrowserNavigation(
  page,
  { origin, testId, destination, starts, scroll, kind, actions, history },
) {
  const markerOptions = {
    shouldTrackKind: kind !== undefined,
    shouldTrackActions: actions !== undefined,
  };

  if (history !== undefined) {
    await page.goto(`${origin}/docs/object?sentinel=history`);
    await page.goto(`${origin}/docs`);
    await waitForHydration(page);
  }
  const anchor = page.getByTestId(testId);
  await anchor.scrollIntoViewIfNeeded();
  if (scroll !== undefined) {
    if ((await page.evaluate(() => window.scrollY)) < 400) {
      await page.evaluate(() => window.scrollTo(0, 500));
    }
  }

  let expectedDestination = destination;
  if (expectedDestination === undefined) {
    const href = await anchor.getAttribute('href');
    if (href === null) throw new Error(`${testId}: link has no href`);
    expectedDestination = new URL(href, origin).href;
  }
  const before = await page.evaluate(
    ({ shouldTrackKind, shouldTrackActions }) => {
      if (shouldTrackKind) window.__fastLinkDocument = 'original';
      if (shouldTrackActions) sessionStorage.setItem('policy-actions', '0');
      return { historyLength: history.length, scrollY: window.scrollY };
    },
    markerOptions,
  );
  if (scroll !== undefined && before.scrollY < 400) {
    throw new Error(`${testId}: fixture did not scroll`);
  }

  let documentRequests = 0;
  const onRequest = (request) => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
      documentRequests++;
    }
  };
  if (markerOptions.shouldTrackKind) page.on('request', onRequest);

  try {
    if (starts === 'pointerdown') {
      await pressBeforeRelease(page, testId, expectedDestination);
    } else {
      await pressAfterRelease(page, testId, expectedDestination);
    }
    if (scroll === 'reset') {
      await page.waitForFunction(() => window.scrollY === 0);
    }

    const after = await page.evaluate(
      ({ shouldTrackKind, shouldTrackActions }) => ({
        actions: shouldTrackActions
          ? sessionStorage.getItem('policy-actions')
          : null,
        historyLength: history.length,
        sameDocument: shouldTrackKind
          ? window.__fastLinkDocument === 'original'
          : null,
        scrollY: window.scrollY,
      }),
      markerOptions,
    );
    const activationDocumentRequests = documentRequests;
    if (history !== undefined) {
      // URL commitment precedes React content completion. Traverse only after
      // the destination has rendered so back/forward does not abort that render.
      await page.getByRole('heading', { name: 'Fast destination' }).waitFor();
      const destinationUrl = page.url();
      await page.goBack();
      await page.waitForURL(
        history === 'push'
          ? `${origin}/docs`
          : `${origin}/docs/object?sentinel=history`,
      );
      if (history === 'push') await waitForHydration(page);
      else
        await page
          .getByRole('heading', { name: 'Object destination' })
          .waitFor();
      await page.goForward();
      await page.waitForURL(destinationUrl);
      await page.getByRole('heading', { name: 'Fast destination' }).waitFor();
    }
    return { before, after, documentRequests: activationDocumentRequests };
  } finally {
    if (markerOptions.shouldTrackKind) page.off('request', onRequest);
  }
}

function assertBrowserNavigation(
  { testId, history, scroll, kind, actions },
  { before, after, documentRequests },
) {
  if (kind !== undefined && after.sameDocument !== (kind === 'router')) {
    throw new Error(`${testId}: expected ${kind} navigation`);
  }
  if (
    kind !== undefined &&
    documentRequests !== (kind === 'document' ? 1 : 0)
  ) {
    throw new Error(
      `${testId}: expected ${kind} navigation, observed ${documentRequests} document requests`,
    );
  }
  if (actions !== undefined && after.actions !== String(actions)) {
    throw new Error(
      `${testId}: expected action count ${actions}, observed ${after.actions}`,
    );
  }
  if (history !== undefined) {
    const expectedHistoryDelta = history === 'push' ? 1 : 0;
    const historyDelta = after.historyLength - before.historyLength;
    if (historyDelta !== expectedHistoryDelta) {
      throw new Error(
        `${testId}: expected ${history} history, length changed by ${historyDelta}`,
      );
    }
  }
  if (scroll === 'preserve' && Math.abs(after.scrollY - before.scrollY) > 10) {
    throw new Error(
      `${testId}: expected preserved scroll, moved ${before.scrollY} -> ${after.scrollY}`,
    );
  }
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No fixture port');
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null)
      throw new Error(`Next.js exited with ${child.exitCode}`);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await delay(100);
  }
  throw new Error('Next.js fixture did not start');
}

async function checkPrefetch(page, origin) {
  // Each named case has a fresh context, keeping both destinations cold.
  const disabledRequests = [];
  const matches = (request, path) => {
    const url = new URL(request.url());
    return url.origin === origin && url.pathname === `/docs/${path}`;
  };
  const onRequest = (request) => {
    if (matches(request, 'prefetch-disabled'))
      disabledRequests.push(request.url());
  };
  page.on('request', onRequest);
  try {
    // Start observing before the button mounts either link.
    await Promise.all([
      page.waitForRequest((request) => matches(request, 'prefetch-enabled'), {
        timeout: 5000,
      }),
      (async () => {
        await page.getByTestId('show-prefetch').click();
        await page.getByTestId('prefetch-enabled').hover();
      })(),
    ]);
    await page.getByTestId('prefetch-disabled').hover();
    // Bounded negative observation after the enabled link proves scheduling works.
    // This does not claim the disabled link can never prefetch at a later time.
    await delay(5000);
    if (disabledRequests.length > 0)
      throw new Error(
        `Custom renderer lost prefetch=false: ${disabledRequests.join(', ')}`,
      );
  } finally {
    page.off('request', onRequest);
  }
}

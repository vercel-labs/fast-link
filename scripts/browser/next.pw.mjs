/*
 * Runs the built Next.js app in real browsers to check navigation timing, native
 * activation, routing options, and policies. This verifies integration with Next
 * Link and App Router beyond what the mocked component tests can prove.
 */

/* oxlint-disable no-await-in-loop -- Fixture startup and browser interactions must run in order. */

import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';

import {
  countRequests,
  expectsPreparation,
  fixtureOrigin,
  getPressBox,
  installPressCounter,
  pressAndHold,
} from './next-helpers.mjs';
import { expect, test } from './test-fixtures.mjs';

const scenarios = [
  ...['onClick', 'onNavigate', 'prefetch', 'hook'].map((guard) => [
    `ref reattachment during ${guard} preserves current click acceptance`,
    async (page) => {
      const requests = countRequests(page);
      await pressAndHold(page, `ref-${guard}`);
      assert.equal(new URL(page.url()).pathname, '/docs');
      await page.mouse.up();
      await page.waitForURL(`${fixtureOrigin}/docs/fast?from=ref-${guard}`);
      await expect(
        page.getByRole('heading', { name: 'Fast destination' }),
      ).toBeVisible();
      assert.equal(
        await page.evaluate(() => sessionStorage.getItem('ref-actions')),
        '1',
      );
      assert.equal(requests.document, 0);
      if (guard === 'prefetch')
        assert.deepEqual(
          await page.evaluate(() =>
            JSON.parse(sessionStorage.getItem('ref-decision')),
          ),
          { kind: 'router', scroll: false },
        );
    },
  ]),
  ...['pending', 'ready'].map((state) => [
    `managed preparation reuses ${state} work only after release`,
    async (page) => {
      test.skip(
        !expectsPreparation,
        'The minimum supported Next version has no preparation API',
      );
      const gate = Promise.withResolvers();
      let requests = 0;
      await page.route('**/docs/slow?*', async (route) => {
        requests++;
        await gate.promise;
        await route.continue();
      });
      const requested = page.waitForRequest(
        (request) => new URL(request.url()).pathname === '/docs/slow',
      );
      const completed = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/docs/slow',
      );
      requested.catch(() => undefined);
      completed.catch(() => undefined);
      try {
        await pressAndHold(page, 'slow');
        await requested;
        if (state === 'ready') {
          gate.resolve();
          await completed;
          await page.waitForFunction(
            () =>
              performance
                .getEntriesByType('resource')
                .some(
                  (entry) =>
                    new URL(entry.name).pathname === '/docs/slow' &&
                    entry.responseEnd > 0,
                ),
            undefined,
            { timeout: 5000 },
          );
        }
        assert.equal(new URL(page.url()).pathname, '/docs');
        await expectOutput(page, 'events', '');
        await expect(
          page.getByRole('heading', { name: 'Home', exact: true }),
        ).toBeVisible();
        await page.mouse.up();
        if (state === 'pending') {
          await expectOutput(page, 'events', 'slow-fast');
          gate.resolve();
        }
        await page.waitForURL(/\/docs\/slow$/);
        await expect(
          page.getByRole('heading', { name: 'Slow destination' }),
        ).toBeVisible();
        assert.equal(
          requests,
          1,
          'commit must reuse the request started on press',
        );
      } finally {
        gate.resolve();
      }
    },
  ]),
  ...['fast', 'region-fast'].map((testId) => [
    `${testId}: reuses completed static preparation after release`,
    async (page) => {
      test.skip(
        !expectsPreparation,
        'The minimum supported Next version has no preparation API',
      );
      const requests = countRequests(page, '/docs/fast');
      const before = await page.evaluate(() => ({
        timeOrigin: performance.timeOrigin,
        history: history.length,
      }));
      const completed = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/docs/fast',
      );
      completed.catch(() => undefined);
      await pressAndHold(page, testId);
      const response = await completed;
      assert.equal(response.status(), 200);
      await response.finished();
      await page.waitForFunction(() =>
        performance
          .getEntriesByType('resource')
          .some(
            (entry) =>
              new URL(entry.name).pathname === '/docs/fast' &&
              entry.responseEnd > 0,
          ),
      );
      assert.equal(requests.route, 1);
      assert.equal(new URL(page.url()).pathname, '/docs');
      await expect(
        page.getByRole('heading', { name: 'Home', exact: true }),
      ).toBeVisible();

      await page.mouse.up();
      await page.waitForURL(/\/docs\/fast\?from=(home|region)#destination$/);
      await expect(
        page.getByRole('heading', { name: 'Fast destination' }),
      ).toBeVisible();
      assert.equal(
        requests.route,
        1,
        'commit must reuse completed static work',
      );
      assert.deepEqual(
        await page.evaluate(() => ({
          timeOrigin: performance.timeOrigin,
          history: history.length,
        })),
        { timeOrigin: before.timeOrigin, history: before.history + 1 },
      );
    },
  ]),
  [
    'managed release away discards completed preparation',
    async (page) => {
      test.skip(
        !expectsPreparation,
        'The minimum supported Next version has no preparation API',
      );
      const completed = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/docs/slow',
      );
      completed.catch(() => undefined);
      await pressAndHold(page, 'slow');
      await completed;
      await page.waitForFunction(
        () =>
          performance
            .getEntriesByType('resource')
            .some(
              (entry) =>
                new URL(entry.name).pathname === '/docs/slow' &&
                entry.responseEnd > 0,
            ),
        undefined,
        { timeout: 5000 },
      );
      await page.mouse.move(1, 1);
      await page.mouse.up();
      await expectOutput(page, 'events', '');
      assert.equal(new URL(page.url()).pathname, '/docs');
    },
  ],
  [
    'managed guard uses the policy committed during onNavigate',
    async (page) => {
      const requests = countRequests(page);
      await pressAndHold(page, 'guard-policy');
      assert.equal(new URL(page.url()).pathname, '/docs');
      await page.mouse.up();
      await page.waitForURL(/\/docs\/fast\?from=guard-policy$/);
      assert.equal(
        await page.evaluate(() => sessionStorage.getItem('guard-policy')),
        'document',
      );
      assert.equal(requests.document, 1);
    },
  ],
  [
    'benchmark interactions use the supplied measurement and warmup counts',
    async (page) => {
      await page.goto(`${fixtureOrigin}/docs/benchmark`);
      await expect
        .poll(() => page.evaluate(() => Boolean(window.benchmark)))
        .toBe(true);
      const observations = await page.evaluate(() => {
        const cases = [
          ['bare', null],
          ['plain', null],
        ];
        for (const variant of ['core', 'react'])
          for (const mode of ['release', 'immediate', 'native'])
            cases.push([variant, mode]);
        return cases.map(([variant, mode]) => {
          const counts = { mouse: 0, touch: 0, clicks: 0 };
          const onDown = (event) => counts[event.pointerType]++;
          const onClick = () => counts.clicks++;
          document.addEventListener('pointerdown', onDown, true);
          document.addEventListener('click', onClick, true);
          try {
            const workload = { interactions: 7, warmup: 3 };
            const metrics =
              variant === 'bare' || variant === 'core'
                ? window.benchmark.micro(variant, mode, workload)
                : window.benchmark.interaction(variant, mode, workload);
            return { variant: `${variant} ${mode}`, counts, metrics };
          } finally {
            document.removeEventListener('pointerdown', onDown, true);
            document.removeEventListener('click', onClick, true);
          }
        });
      });
      for (const { variant, counts, metrics } of observations) {
        // Core probes cleanup with a press and click before removing its
        // anchor; React unmounts first.
        const extra = /^(bare|core) /.test(variant) ? 1 : 0;
        assert.deepEqual(
          counts,
          { mouse: 10 + extra, touch: 10, clicks: 10 + extra },
          variant,
        );
        assert.equal(metrics.accepted.correct, true, variant);
        assert.equal(metrics.ignored.correct, true, variant);
      }
    },
  ],
  [
    'prefetch respects explicit false with a cold positive control',
    (page) => checkPrefetch(page, fixtureOrigin),
  ],
  ...[
    ['fast', /\/docs\/fast\?from=home#destination$/],
    ['object', /\/docs\/object\?ref=a\+b$/],
  ].map(([testId, destination]) => [
    `${testId}: routes after release with one base path`,
    (page) => pressAfterRelease(page, testId, destination),
  ]),
  [
    'onNavigate cancellation preserves click handlers',
    async (page) => {
      await page.getByTestId('cancel').click();
      await expectOutput(page, 'events', 'click,navigate');
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
  [
    'slow managed route commits on release while Link status stays idle',
    checkSlowStatus,
  ],
  [
    'inline ref churn preserves a single accepted click',
    async (page) => {
      await pressAndHold(page, 'churn');
      await expectOutput(page, 'events', '');
      await page.mouse.up();
      await expectOutput(page, 'events', 'allowed,fast');
      assert.ok(
        Number(
          await page.getByTestId('churn').getAttribute('data-ref-calls'),
        ) >= 2,
      );
      await page.waitForURL(/\/docs\/slow$/);
    },
  ],
  ...[
    ['capture-stop', /\/docs\/slow\?from=capture$/],
    ['closed-capture-host', /\/docs\/slow\?from=closed-capture$/],
  ].map(([testId, destination]) => [
    `${testId}: leaves a stopped managed click to native navigation`,
    (page) => checkStoppedManagedClick(page, testId, destination),
  ]),
  [
    'ordinary region link inside a closed shadow root prepares before release and commits once',
    async (page) => {
      const host = page.getByTestId('closed-capture-host');
      await host.scrollIntoViewIfNeeded();
      const box = await host.boundingBox();
      assert.ok(box);
      const requests = countRequests(page);
      const response = Promise.withResolvers();
      await page.route('**/docs/slow?*', async (route) => {
        await response.promise;
        await route.continue();
      });
      const requested = page.waitForRequest((request) => {
        const url = new URL(request.url());
        return (
          url.pathname === '/docs/slow' &&
          url.searchParams.get('from') === 'closed-region'
        );
      });
      requested.catch(() => undefined);
      await page.mouse.move(box.x + 100, box.y + 60);
      try {
        await page.mouse.down();
        try {
          await expectOutput(page, 'events', '');
          if (expectsPreparation) await requested;
          assert.equal(
            new URL(page.url()).pathname,
            '/docs',
            'response must still be held',
          );
        } finally {
          await page.mouse.up();
        }
        await expectOutput(
          page,
          'events',
          'shadow-region-fast,shadow-region-prevented',
        );
      } finally {
        response.resolve();
      }
      await page.waitForURL(/\/docs\/slow\?from=closed-region$/);
      assert.equal(
        requests.document,
        0,
        'suppressed follow-up must not activate the document',
      );
    },
  ],
  ...[
    ['options', /\/docs\/fast\?from=options$/],
    ['region-options', /\/docs\/fast\?from=region-options$/],
  ].map(([testId, destination]) => [
    `${testId}: replaces history and preserves scroll`,
    (page) =>
      checkBrowserNavigation(page, {
        origin: fixtureOrigin,
        testId,
        destination,
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
    'region click rerender preserves one navigation and idle Link status',
    async (page) => {
      const gate = Promise.withResolvers();
      await page.route('**/docs/slow?*', async (route) => {
        await gate.promise;
        await route.continue();
      });
      try {
        await pressAndHold(page, 'region-churn');
        try {
          await expectOutput(page, 'events', '');
          await expect(page.getByTestId('region-pending')).toHaveText('idle');
        } finally {
          await page.mouse.up();
        }
        await expectOutput(
          page,
          'events',
          'region-fast,region-prevented,region-parent',
        );
      } finally {
        gate.resolve();
      }
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
        kind,
        history,
        actions: 1,
      }),
  ]),
  ...[
    ['policy-immediate-owned', 'router'],
    ['policy-immediate-foreign', 'document'],
  ].map(([testId, kind]) => [
    `${testId}: ${kind} navigation on press with one policy action`,
    (page) =>
      checkBrowserNavigation(page, {
        origin: fixtureOrigin,
        testId,
        kind,
        starts: 'pointerdown',
        history: 'push',
        actions: 1,
      }),
  ]),
  ...[
    [
      'immediate',
      'immediate-navigate,immediate-fast',
      /\/docs\/slow\?from=immediate$/,
    ],
    [
      'immediate-region',
      'immediate-region-fast',
      /\/docs\/slow\?from=immediate-region$/,
    ],
  ].map(([testId, pressEvents, destination]) => [
    `${testId}: navigates on press and prevents the follow-up click of a mounted source`,
    (page) =>
      checkImmediateRetainedSource(page, testId, pressEvents, destination),
  ]),
  // pressAfterRelease also checks that the containing immediate region did nothing.
  ...['native', 'native-region', 'release-in-immediate'].map((testId) => [
    `${testId}: routes on release through the client router`,
    (page) =>
      checkBrowserNavigation(page, {
        origin: fixtureOrigin,
        testId,
        kind: 'router',
        actions: 0,
      }),
  ]),
  ...['policy-native', 'policy-optout'].map((testId) => [
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
      await expect(pending).toHaveAttribute('data-pending', 'false');
      assert.equal(await pending.getAttribute('data-attached'), 'true');
      await page.mouse.up();
      await expect(pending).toHaveAttribute('data-pending', 'true');
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

test.beforeEach(async ({ page }) => {
  await installPressCounter(page);
  await page.goto(`${fixtureOrigin}/docs`);
  await waitForHydration(page);
});

for (const [name, run, options] of scenarios) {
  test.describe(() => {
    if (options) test.use(options);
    test(name, async ({ page }) => run(page));
  });
}

async function waitForHydration(page) {
  await expect(page.getByTestId('closed-capture-host')).toHaveAttribute(
    'data-ready',
    'true',
  );
}

async function expectOutput(page, testId, text) {
  await expect(page.getByTestId(testId)).toHaveJSProperty('textContent', text);
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
    await expectOutput(page, 'events', '');
    await page.mouse.up();
    await expectOutput(page, 'events', 'slow-fast');
    await requested;
    assert.equal(
      new URL(page.url()).pathname,
      '/docs',
      'response must still be held',
    );
    assert.equal(await page.getByTestId('pending').textContent(), 'idle');
  } finally {
    gate.resolve();
  }
  await page.waitForURL(/\/docs\/slow$/);
}

async function checkImmediateRetainedSource(
  page,
  testId,
  pressEvents,
  destination,
) {
  const gate = Promise.withResolvers();
  const requests = countRequests(page, '/docs/slow');
  await page.route('**/docs/slow?*', async (route) => {
    await gate.promise;
    await route.continue();
  });
  try {
    const requested = page.waitForRequest(
      (request) => new URL(request.url()).pathname === '/docs/slow',
    );
    requested.catch(() => undefined);
    await pressAndHold(page, testId);
    await expectOutput(page, 'events', pressEvents);
    await requested;
    assert.equal(
      new URL(page.url()).pathname,
      '/docs',
      'response must still be held',
    );
    await page.mouse.up();
    // The source is still mounted, so its click handlers observe the prevented click.
    await expectOutput(page, 'events', `${pressEvents},${testId}-prevented`);
  } finally {
    gate.resolve();
  }
  try {
    await page.waitForURL(destination);
    await expect(
      page.getByRole('heading', { name: 'Slow destination' }),
    ).toBeVisible();
    assert.equal(requests.route, 1, 'one navigation for the accepted press');
    assert.equal(requests.document, 0);
  } finally {
    requests.stop();
  }
}

async function checkStoppedManagedClick(page, testId, destination) {
  await waitForHydration(page);
  const target = page.getByTestId(testId);
  await target.scrollIntoViewIfNeeded();
  const box = await getPressBox(target);
  if (!box) throw new Error(`Missing ${testId}`);
  const requests = countRequests(page);
  try {
    await page.mouse.move(
      box.x + box.width / 2,
      box.y + (testId === 'closed-capture-host' ? 20 : box.height / 2),
    );
    await page.mouse.down();
    await expectOutput(page, 'events', '');
    await page.mouse.up();
    await page.waitForURL(destination);
    assert.equal(
      requests.document,
      1,
      'stopped propagation leaves browser activation intact',
    );
  } finally {
    requests.stop();
  }
}

async function pressBeforeRelease(page, testId, destination) {
  await pressAndHold(page, testId);
  try {
    await page.waitForURL(destination);
  } finally {
    await page.mouse.up();
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

  const requests = countRequests(page);

  try {
    if (starts === 'pointerdown')
      await pressBeforeRelease(page, testId, expectedDestination);
    else await pressAfterRelease(page, testId, expectedDestination);
    if (scroll === 'reset') {
      await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
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
    const activationDocumentRequests = requests.document;
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
    requests.stop();
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

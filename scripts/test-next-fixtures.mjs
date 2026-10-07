/* oxlint-disable no-await-in-loop -- Fixture startup and browser interactions must run in order. */

import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
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

try {
  await waitForServer(`${fixtureOrigin}/docs`, serverProcess);
  for (const [name, browserType] of Object.entries({
    chromium,
    firefox,
    webkit,
  })) {
    const browser = await browserType.launch();
    try {
      const page = await browser.newPage();
      await page.goto(`${fixtureOrigin}/docs`);
      await pressBeforeRelease(
        page,
        'fast',
        /\/docs\/fast\?from=home#destination$/,
      );
      await page.goto(`${fixtureOrigin}/docs`);
      await pressBeforeRelease(page, 'object', /\/docs\/object\?ref=a\+b$/);
      await page.goto(`${fixtureOrigin}/docs`);
      await page.getByTestId('cancel').click();
      if (new URL(page.url()).pathname !== '/docs')
        throw new Error('Canceled link navigated');
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="events"]')?.textContent ===
          'navigate,click',
      );
      await page.getByTestId('native').focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/docs\/fast$/);
      await page.goto(`${fixtureOrigin}/docs`);
      await pressAfterRelease(page, 'as', /\/docs\/fast$/);
      await page.goto(`${fixtureOrigin}/docs`);
      await pressAfterRelease(page, 'legacy', /\/docs\/fast$/);
      await page.goto(`${fixtureOrigin}/docs`);
      const slow = await page.getByTestId('slow').boundingBox();
      if (!slow) throw new Error('Missing slow link');
      await page.mouse.move(slow.x + slow.width / 2, slow.y + slow.height / 2);
      await page.mouse.down();
      await delay(150);
      if ((await page.getByTestId('pending').textContent()) !== 'idle') {
        throw new Error('useLinkStatus reported the fast path as pending');
      }
      await page.mouse.up();
      await page.waitForURL(/\/docs\/slow$/);
      await page.goto(`${fixtureOrigin}/docs`);
      const churn = await page.getByTestId('churn').boundingBox();
      if (!churn) throw new Error('Missing churn link');
      await page.mouse.move(
        churn.x + churn.width / 2,
        churn.y + churn.height / 2,
      );
      await page.mouse.down();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="events"]')?.textContent ===
          'fast',
      );
      if (
        Number(await page.getByTestId('churn').getAttribute('data-ref-calls')) <
        2
      )
        throw new Error('Updated callback ref was not called');
      await page.mouse.up();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="events"]')?.textContent ===
          'fast,prevented',
      );
      await page.waitForURL(/\/docs\/slow$/);
      await checkBrowserNavigation(page, {
        origin: fixtureOrigin,
        testId: 'options',
        destination: /\/docs\/fast\?from=options$/,
        starts: 'pointerdown',
        history: 'replace',
        scroll: 'preserve',
      });
      await page.goto(`${fixtureOrigin}/docs`);
      const beforeRegionHistory = await page.evaluate(() => history.length);
      await pressBeforeRelease(
        page,
        'region-fast',
        /\/docs\/fast\?from=region#destination$/,
      );
      await delay(150);
      const afterRegionHistory = await page.evaluate(() => history.length);
      if (afterRegionHistory !== beforeRegionHistory + 1)
        throw new Error('Region link started more than one route');
      await page.goto(`${fixtureOrigin}/docs`);
      await page.getByTestId('region-native').focus();
      await page.keyboard.press('Enter');
      await page.waitForURL(/\/docs\/fast\?from=keyboard$/);
      await page.goto(`${fixtureOrigin}/docs`);
      await page.getByTestId('region-cancel').click();
      if (new URL(page.url()).pathname !== '/docs')
        throw new Error(
          'Opted-out region link ignored onNavigate cancellation',
        );
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="events"]')?.textContent ===
          'region-click,region-cancel,region-parent',
      );
      await page.goto(`${fixtureOrigin}/docs`);
      await page.getByTestId('region-guard').click();
      if (new URL(page.url()).pathname !== '/docs')
        throw new Error('Opted-out region link ignored its click guard');
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="events"]')?.textContent ===
          'region-guard,region-parent',
      );
      await page.goto(`${fixtureOrigin}/docs`);
      await page.getByTestId('region-churn').scrollIntoViewIfNeeded();
      const regionChurn = await page.getByTestId('region-churn').boundingBox();
      if (!regionChurn) throw new Error('Missing region churn link');
      await page.mouse.move(
        regionChurn.x + regionChurn.width / 2,
        regionChurn.y + regionChurn.height / 2,
      );
      await page.mouse.down();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="events"]')?.textContent ===
          'region-fast',
      );
      if ((await page.getByTestId('region-pending').textContent()) !== 'idle')
        throw new Error(
          'Region useLinkStatus reported fast navigation as pending',
        );
      await page.mouse.up();
      await page.waitForFunction(
        () =>
          document.querySelector('[data-testid="events"]')?.textContent ===
          'region-fast,region-prevented,region-parent',
      );
      await page.waitForURL(/\/docs\/slow$/);
      await checkBrowserNavigation(page, {
        origin: fixtureOrigin,
        testId: 'region-options',
        destination: /\/docs\/fast\?from=region-options$/,
        starts: 'click',
        history: 'replace',
        scroll: 'preserve',
      });
      await checkPolicyNavigation(page, fixtureOrigin);
      const touchContext = await browser.newContext({ hasTouch: true });
      try {
        const touchPage = await touchContext.newPage();
        await touchPage.goto(`${fixtureOrigin}/docs`);
        await touchPage.getByTestId('region-native').evaluate((element) => {
          element.dispatchEvent(
            new PointerEvent('pointerdown', {
              bubbles: true,
              button: 0,
              pointerType: 'touch',
            }),
          );
        });
        await delay(150);
        if (new URL(touchPage.url()).pathname !== '/docs')
          throw new Error('Region navigated on touch pointerdown');
        const touchLink = await touchPage
          .getByTestId('region-native')
          .boundingBox();
        if (!touchLink) throw new Error('Missing region touch link');
        await touchPage.touchscreen.tap(
          touchLink.x + touchLink.width / 2,
          touchLink.y + touchLink.height / 2,
        );
        await touchPage.waitForURL(/\/docs\/fast\?from=keyboard$/);
        await touchPage.goto(`${fixtureOrigin}/docs`);
        await touchPage.evaluate(() =>
          sessionStorage.setItem('policy-actions', '0'),
        );
        const policyTouch = touchPage.getByTestId('policy-region-owned');
        await policyTouch.scrollIntoViewIfNeeded();
        await policyTouch.evaluate((element) =>
          element.dispatchEvent(
            new PointerEvent('pointerdown', {
              bubbles: true,
              button: 0,
              pointerType: 'touch',
            }),
          ),
        );
        if (
          (await touchPage.evaluate(() =>
            sessionStorage.getItem('policy-actions'),
          )) !== '0'
        )
          throw new Error('Policy intercepted touch pointerdown');
        await policyTouch.tap();
        await touchPage.waitForURL(/\/docs\/fast\?owner=owned$/);
        if (
          (await touchPage.evaluate(() =>
            sessionStorage.getItem('policy-actions'),
          )) !== '0'
        )
          throw new Error('Policy intercepted touch activation');
      } finally {
        await touchContext.close();
      }
      console.log(
        `${version} ${name}: FastLink and FastLinkRegion pointerdown, basePath, native activation, opt-outs, follow-up click, replace, scroll, policy, custom renderer, document navigation passed`,
      );
    } finally {
      await browser.close();
    }
  }
} catch (error) {
  throw new Error(`${version} fixture failed:\n${output}`, { cause: error });
} finally {
  serverProcess.kill('SIGTERM');
}
async function pressBeforeRelease(page, testId, destination) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`Missing ${testId} link`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  try {
    await page.waitForURL(destination);
  } finally {
    await page.mouse.up();
  }
}

async function pressAfterRelease(page, testId, destination) {
  const box = await page.getByTestId(testId).boundingBox();
  if (!box) throw new Error(`Missing ${testId} link`);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await delay(150);
  if (new URL(page.url()).pathname !== '/docs') {
    throw new Error(`${testId} navigated on pointerdown`);
  }
  await page.mouse.up();
  await page.waitForURL(destination);
}

async function checkBrowserNavigation(page, expectation) {
  validateBrowserNavigationExpectation(expectation);
  const observation = await observeBrowserNavigation(page, expectation);
  assertBrowserNavigation(expectation, observation);
}

function validateBrowserNavigationExpectation({
  testId,
  starts,
  history,
  scroll,
  kind,
}) {
  if (!['pointerdown', 'click'].includes(starts)) {
    throw new TypeError(`${testId}: invalid navigation start ${starts}`);
  }
  if (history !== undefined && !['push', 'replace'].includes(history)) {
    throw new TypeError(`${testId}: invalid history method ${history}`);
  }
  if (scroll !== undefined && !['preserve', 'reset'].includes(scroll)) {
    throw new TypeError(`${testId}: invalid scroll expectation ${scroll}`);
  }
  if (kind !== undefined && !['router', 'document'].includes(kind)) {
    throw new TypeError(`${testId}: invalid navigation kind ${kind}`);
  }
}

async function observeBrowserNavigation(
  page,
  { origin, testId, destination, starts, scroll, kind, actions },
) {
  const markerOptions = {
    shouldTrackKind: kind !== undefined,
    shouldTrackActions: actions !== undefined,
  };

  await page.goto(`${origin}/docs`);
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
    return { before, after, documentRequests };
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
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode !== null)
      throw new Error(`Next.js exited with ${child.exitCode}`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The server may still be starting.
    }
    await delay(100);
  }
  throw new Error('Next.js fixture did not start');
}

async function checkPolicyNavigation(page, origin) {
  const cases = [
    ['policy-owned', 'router', false],
    ['policy-foreign', 'document', false],
    ['policy-unknown', 'document', false],
    ['policy-region-owned', 'router', false],
    ['policy-region-foreign', 'document', false],
    ['policy-region-unknown', 'document', false],
    ['policy-router-replace', 'router', true],
    ['policy-document-replace', 'document', true],
  ];
  for (const [testId, kind, replace] of cases) {
    await checkBrowserNavigation(page, {
      origin,
      testId,
      starts: 'pointerdown',
      kind,
      history: replace ? 'replace' : 'push',
      actions: 1,
    });
  }

  for (const testId of ['policy-disabled', 'policy-optout']) {
    await page.goto(`${origin}/docs`);
    await page.getByTestId(testId).scrollIntoViewIfNeeded();
    await pressAfterRelease(page, testId, /\/docs\/fast\?owner=owned$/);
  }

  await page.goto(`${origin}/docs`);
  await page.evaluate(() => sessionStorage.setItem('policy-actions', '0'));
  await page.getByTestId('policy-owned').focus();
  await page.keyboard.press('Enter');
  await page.waitForURL(/\/docs\/fast\?owner=owned$/);
  if (
    (await page.evaluate(() => sessionStorage.getItem('policy-actions'))) !==
    '0'
  )
    throw new Error('Policy intercepted keyboard activation');

  let prefetchedSlow = false;
  const onPrefetch = (request) => {
    if (new URL(request.url()).pathname === '/docs/slow') prefetchedSlow = true;
  };
  page.on('request', onPrefetch);
  await page.goto(`${origin}/docs`);
  const pending = page.getByTestId('policy-pending');
  await pending.scrollIntoViewIfNeeded();
  const display = await pending.evaluate(
    (element) => getComputedStyle(element.closest('nav').parentElement).display,
  );
  if (display !== 'contents')
    throw new Error('Policy Region changed layout display');
  const box = await pending.boundingBox();
  if (!box) throw new Error('Missing custom renderer');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  page.off('request', onPrefetch);
  if (prefetchedSlow) throw new Error('Custom renderer lost prefetch=false');
  await page.mouse.down();
  await page.waitForFunction(
    () =>
      document
        .querySelector('[data-testid="policy-pending"]')
        ?.getAttribute('data-pending') === 'true',
  );
  if ((await pending.getAttribute('data-attached')) !== 'true')
    throw new Error('Custom renderer lost its ref');
  await page.mouse.up();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="policy-events"]')?.textContent ===
      'capture,click:prevented,bubble:prevented',
  );
  await page.waitForURL(/\/docs\/slow\?owner=owned$/);

  for (const [testId, keepScroll] of [
    ['policy-keep-scroll', true],
    ['policy-default-scroll', false],
    ['policy-region-keep-scroll', true],
  ]) {
    await checkBrowserNavigation(page, {
      origin,
      testId,
      starts: 'pointerdown',
      scroll: keepScroll ? 'preserve' : 'reset',
    });
  }
}

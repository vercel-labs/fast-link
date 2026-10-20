/*
 * Uses Playwright mouse presses and releases across browsers, including DOM changes
 * and releases away from the pressed element. These expose click-targeting and
 * duplicate-navigation behavior that synthetic events cannot establish.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { chromium, firefox, webkit } from 'playwright';

const core = await readFile(
  new URL('../../packages/core/dist/index.js', import.meta.url),
  'utf8',
);
await test('core targeting browsers', { concurrency: true }, async (t) => {
  await Promise.all(
    Object.entries({ chromium, firefox, webkit }).map(([name, browserType]) =>
      t.test(name, { concurrency: 2 }, (browserTest) =>
        checkBrowser(name, browserType, browserTest),
      ),
    ),
  );
});

async function checkBrowser(name, browserType, t) {
  const browser = await browserType.launch();
  try {
    await Promise.all(
      [
        'descendant',
        'ancestor',
        'sibling',
        'remove-target',
        'replace-anchor',
        'change-href',
        'stop-capture',
        'copies-extensible',
        'copies-nonextensible',
        'default-document',
        'svg-standalone',
        'svg-html',
        'iframe',
      ].map((scenario) =>
        t.test(scenario, { timeout: 15000 }, () =>
          checkScenario(name, browser, scenario),
        ),
      ),
    );
  } finally {
    await browser.close();
  }
}

async function checkScenario(name, browser, scenario) {
  if (scenario === 'iframe') return checkIframe(browser);
  if (scenario.startsWith('svg-')) return checkSvg(browser, scenario);
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  try {
    const requests = [];
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('http://fast-link.test/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/core.js')
        return route.fulfill({ contentType: 'text/javascript', body: core });
      if (path !== '/') {
        if (route.request().isNavigationRequest()) requests.push(path);
        return route.abort();
      }
      return route.fulfill({
        contentType: 'text/html',
        body: '<div id="root"><a id="a" draggable="false" href="/first"><span id="pressed">Press</span><span id="released">Release</span></a><a id="b" draggable="false" href="/second">Sibling</a></div><style>a,span{display:inline-block;padding:20px;user-select:none}</style>',
      });
    });
    await page.goto('http://fast-link.test/');
    await page.evaluate(async (caseName) => {
      const { createFastLink } = await import('/core.js');
      const root = document.querySelector('#root');
      const anchor = document.querySelector('#a');
      window.observed = { routes: [], events: [], order: [] };
      document.addEventListener(
        'click',
        () => window.observed.order.push('document-capture'),
        true,
      );
      anchor.addEventListener('click', () =>
        window.observed.order.push('anchor-click'),
      );
      document.addEventListener('click', () =>
        window.observed.order.push('document-bubble'),
      );
      document.addEventListener('click', (event) => {
        window.observed.events.push({
          target: event.target.id,
          trusted: event.isTrusted,
          prevented: event.defaultPrevented,
        });
      });
      if (caseName === 'default-document') {
        createFastLink(root);
        return;
      }
      createFastLink(root, {
        navigate: ({ href }) => {
          window.observed.routes.push(href);
          window.observed.order.push('navigate');
          if (caseName === 'remove-target')
            document.querySelector('#pressed').remove();
          if (caseName === 'replace-anchor')
            anchor.replaceWith(anchor.cloneNode(true));
          if (caseName === 'change-href') anchor.href = '/changed';
        },
      });
      if (caseName.startsWith('copies-')) {
        const { createFastLink: otherCopy } = await import('/core.js?copy=2');
        const inner = document.createElement('div');
        root.append(inner);
        inner.append(anchor);
        otherCopy(inner, {
          navigate: ({ href }) => window.observed.routes.push(href),
        });
        if (caseName === 'copies-nonextensible') {
          document.addEventListener(
            'pointerdown',
            (event) => Object.preventExtensions(event),
            { capture: true },
          );
        }
      }
      if (caseName === 'stop-capture')
        anchor.addEventListener(
          'click',
          (event) => {
            window.observed.events.push({
              target: event.target.id,
              trusted: event.isTrusted,
              prevented: event.defaultPrevented,
            });
            event.stopPropagation();
          },
          { capture: true },
        );
    }, scenario);
    const pressed = await page.locator('#pressed').boundingBox();
    assert.ok(pressed);
    await page.mouse.move(
      pressed.x + pressed.width / 2,
      pressed.y + pressed.height / 2,
    );
    if (scenario === 'default-document') {
      const navigation = page.waitForRequest(
        (request) =>
          request.isNavigationRequest() &&
          new URL(request.url()).pathname === '/first',
      );
      await page.mouse.down();
      assert.equal(new URL((await navigation).url()).pathname, '/first');
      await page.mouse.up();
      return;
    }
    await page.mouse.down();
    assert.deepEqual(await page.evaluate(() => window.observed.routes), [
      '/first',
    ]);
    if (scenario === 'descendant' || scenario === 'sibling') {
      const release = await page
        .locator(scenario === 'sibling' ? '#b' : '#released')
        .boundingBox();
      assert.ok(release);
      await page.mouse.move(
        release.x + release.width / 2,
        release.y + release.height / 2,
      );
    } else if (scenario === 'ancestor') {
      const anchor = await page.locator('#a').boundingBox();
      assert.ok(anchor);
      await page.mouse.move(anchor.x + 2, anchor.y + 2);
    }
    await page.mouse.up();
    const expectedClickCount =
      ['remove-target', 'replace-anchor'].includes(scenario) &&
      name !== 'firefox'
        ? 0
        : 1;
    if (expectedClickCount) {
      await page.waitForFunction(() => window.observed.events.length > 0);
    } else {
      // These engines emit no click after target removal. This bounded window
      // checks for delayed activation; elapsed time cannot prove indefinite absence.
      await page.waitForTimeout(100);
    }
    const observed = await page.evaluate(() => window.observed);
    assert.deepEqual(observed.routes, ['/first']);
    assert.deepEqual(
      requests,
      [],
      `${name}/${scenario}: duplicate document navigation`,
    );
    assert.ok(observed.events.every((event) => event.trusted));
    const expectedTargets = {
      descendant: ['a'],
      ancestor: ['a'],
      sibling: ['root'],
      'remove-target': name === 'firefox' ? ['a'] : [],
      'replace-anchor': name === 'firefox' ? ['root'] : [],
      'change-href': ['pressed'],
      'stop-capture': ['pressed'],
      'copies-extensible': ['pressed'],
      'copies-nonextensible': ['pressed'],
    };
    assert.deepEqual(
      observed.events.map((event) => event.target),
      expectedTargets[scenario],
    );
    if (
      [
        'descendant',
        'ancestor',
        'change-href',
        'stop-capture',
        'copies-extensible',
        'copies-nonextensible',
      ].includes(scenario)
    ) {
      assert.equal(observed.events[0].prevented, true);
    }
    if (scenario === 'sibling')
      assert.equal(observed.events[0].prevented, false);
    if (scenario === 'descendant') {
      assert.deepEqual(observed.order, [
        'navigate',
        'document-capture',
        'anchor-click',
        'document-bubble',
      ]);
    }
    assert.deepEqual(errors, []);
    console.log(
      JSON.stringify({ browser: name, scenario, ...observed, requests }),
    );
  } finally {
    await page.close();
  }
}

async function checkSvg(browser, scenario) {
  const page = await browser.newPage();
  try {
    const requests = [];
    await page.route('http://fast-link.test/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/core.js')
        return route.fulfill({ contentType: 'text/javascript', body: core });
      if (path !== '/') {
        if (route.request().isNavigationRequest()) requests.push(path);
        return route.abort();
      }
      const graphic =
        '<svg width="200" height="80"><a href="/#native"><rect id="pressed" x="10" y="10" width="180" height="60" fill="blue" /></a></svg>';
      return route.fulfill({
        contentType: 'text/html',
        body: `<div id="root">${scenario === 'svg-html' ? `<a href="/first">${graphic}</a>` : graphic}</div>`,
      });
    });
    await page.goto('http://fast-link.test/');
    await page.evaluate(async () => {
      const { createFastLink } = await import('/core.js');
      window.observed = { routes: [], clicks: [] };
      createFastLink(document.querySelector('#root'), {
        navigate: ({ href }) => window.observed.routes.push(href),
      });
      document.addEventListener('click', (event) =>
        window.observed.clicks.push({
          prevented: event.defaultPrevented,
          trusted: event.isTrusted,
        }),
      );
    });
    const pressed = page.locator('#pressed');
    const box = await pressed.boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    assert.deepEqual(
      await page.evaluate(() => window.observed.routes),
      scenario === 'svg-html' ? ['/first'] : [],
    );
    assert.equal(page.url(), 'http://fast-link.test/');
    await page.mouse.up();
    if (scenario === 'svg-standalone')
      await page.waitForURL('http://fast-link.test/#native');
    await page.waitForFunction(() => window.observed.clicks.length === 1);
    assert.deepEqual(await page.evaluate(() => window.observed), {
      routes: scenario === 'svg-html' ? ['/first'] : [],
      clicks: [{ prevented: scenario === 'svg-html', trusted: true }],
    });
    assert.deepEqual(requests, []);
  } finally {
    await page.close();
  }
}

async function checkIframe(browser) {
  const page = await browser.newPage();
  try {
    const destinations = [];
    await page.route('http://fast-link.test/**', (route) => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/core.js')
        return route.fulfill({ contentType: 'text/javascript', body: core });
      let body;
      if (path === '/')
        body =
          '<iframe src="/frame" style="width:400px;height:200px"></iframe>';
      else if (path === '/frame')
        body = `<base href="/child/base/"><a id="child" href="destination?from=iframe#result">Child destination</a><script type="module">import { createFastLink } from '/core.js'; createFastLink(document.body); document.body.dataset.ready = 'true';</script>`;
      else {
        destinations.push(route.request().url());
        body = '<h1>Child arrived</h1>';
      }
      return route.fulfill({ contentType: 'text/html', body });
    });
    await page.goto('http://fast-link.test/');
    const child = page.frames().find((frame) => frame.parentFrame());
    assert.ok(child);
    await child.locator('body[data-ready="true"]').waitFor();
    const box = await child.locator('#child').boundingBox();
    assert.ok(box);
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    try {
      await child.waitForURL(
        'http://fast-link.test/child/base/destination?from=iframe#result',
      );
      await child.getByRole('heading', { name: 'Child arrived' }).waitFor();
      assert.equal(page.url(), 'http://fast-link.test/');
    } finally {
      await page.mouse.up();
    }
    assert.equal(destinations.length, 1);
    assert.equal(new URL(destinations[0]).pathname, '/child/base/destination');
    assert.equal(new URL(destinations[0]).search, '?from=iframe');
    assert.equal(page.url(), 'http://fast-link.test/');
  } finally {
    await page.close();
  }
}

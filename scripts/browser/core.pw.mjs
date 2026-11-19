/*
 * Uses Playwright mouse presses and releases across browsers, including DOM changes
 * and releases away from the pressed element. These expose click-targeting and
 * duplicate-navigation behavior that synthetic events cannot establish.
 *
 * Each scenario runs against the press controller (`createFastLink`) and the
 * immediate and release modes of `createLinkInteraction`. Immediate mode
 * navigates on press like the press controller; release mode navigates only
 * when the binding accepts the matching click.
 */

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { expect, test } from './test-fixtures.mjs';

const core = await readFile(
  new URL('../../packages/core/dist/index.js', import.meta.url),
  'utf8',
);
// Binds a root in one controller kind. Release accepts the matching click during capture.
const binding = `export function bind(core, kind, root, navigate) {
  if (kind === 'fast-link')
    return navigate ? core.createFastLink(root, { navigate }) : core.createFastLink(root);
  const route = navigate ?? (({ url, anchor }) => anchor.ownerDocument.defaultView.location.assign(url.href));
  if (kind === 'immediate')
    return core.createLinkInteraction(root, { mode: 'immediate', navigate: route });
  const controller = core.createLinkInteraction(root, { mode: 'release', prepare: () => null });
  root.addEventListener('click', event => {
    const activation = controller.matchClick(event)?.consume();
    if (!activation) return;
    event.preventDefault();
    route(activation.intent);
  }, true);
  return controller;
}`;
const KINDS = ['fast-link', 'immediate', 'release'];

for (const scenario of [
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
]) {
  for (const kind of KINDS) {
    test(`${kind}: ${scenario}`, async ({ page, browserName }) => {
      if (scenario.startsWith('svg-')) return checkSvg(page, kind, scenario);
      await checkScenario(browserName, page, kind, scenario);
    });
  }
}
test('fast-link: iframe', ({ page }) => checkIframe(page));
for (const scenario of [
  'native-inner-region',
  'immediate-inner-region',
  'switch-to-native',
]) {
  test(`link-interaction: ${scenario}`, ({ page }) =>
    checkRegions(page, scenario));
}

function routeFixture(page, requests, body) {
  return page.route('http://fast-link.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/binding.js')
      return route.fulfill({ contentType: 'text/javascript', body: binding });
    if (path === '/core.js')
      return route.fulfill({ contentType: 'text/javascript', body: core });
    if (path !== '/') {
      if (route.request().isNavigationRequest()) requests.push(path);
      return route.abort();
    }
    return route.fulfill({ contentType: 'text/html', body });
  });
}

async function checkScenario(name, page, kind, scenario) {
  const isRelease = kind === 'release';
  const requests = [];
  await routeFixture(
    page,
    requests,
    '<div id="root"><a id="a" draggable="false" href="/first"><span id="pressed">Press</span><span id="released">Release</span></a><a id="b" draggable="false" href="/second">Sibling</a></div><style>a,span{display:inline-block;padding:20px;user-select:none}</style>',
  );
  await page.goto('http://fast-link.test/');
  await page.evaluate(
    async ([caseName, controllerKind]) => {
      const ownCore = await import('/core.js');
      const { bind } = await import('/binding.js');
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
        bind(ownCore, controllerKind, root);
        return;
      }
      bind(ownCore, controllerKind, root, ({ href }) => {
        window.observed.routes.push(href);
        window.observed.order.push('navigate');
        // Press kinds change the DOM while navigating; release changes it before release.
        if (controllerKind === 'release') return;
        if (caseName === 'remove-target')
          document.querySelector('#pressed').remove();
        if (caseName === 'replace-anchor')
          anchor.replaceWith(anchor.cloneNode(true));
        if (caseName === 'change-href') anchor.href = '/changed';
      });
      if (caseName.startsWith('copies-')) {
        const otherCopy = await import('/core.js?copy=2');
        const inner = document.createElement('div');
        root.append(inner);
        inner.append(anchor);
        bind(otherCopy, controllerKind, inner, ({ href }) =>
          window.observed.routes.push(href),
        );
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
    },
    [scenario, kind],
  );
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
    // Press kinds navigate before release; release waits for the click.
    if (isRelease) assert.equal(page.url(), 'http://fast-link.test/');
    else assert.equal(new URL((await navigation).url()).pathname, '/first');
    await page.mouse.up();
    assert.equal(new URL((await navigation).url()).pathname, '/first');
    return;
  }
  await page.mouse.down();
  assert.deepEqual(
    await page.evaluate(() => window.observed.routes),
    isRelease ? [] : ['/first'],
  );
  if (isRelease) await changePressedLink(page, scenario);
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
  const expectedTargets = expectedClickTargets(name, kind, scenario);
  if (expectedTargets.length) {
    await expect
      .poll(() => page.evaluate(() => window.observed.events.length))
      .toBeGreaterThan(0);
  } else {
    // These engines emit no click after target removal. This bounded window
    // checks for delayed activation; elapsed time cannot prove indefinite absence.
    await page.waitForTimeout(100);
  }
  const observed = await page.evaluate(() => window.observed);
  assert.deepEqual(observed.routes, expectedRoutes(kind, scenario));
  assert.deepEqual(
    requests,
    [],
    `${name}/${scenario}: duplicate document navigation`,
  );
  assert.ok(observed.events.every((event) => event.trusted));
  assert.deepEqual(
    observed.events.map((event) => event.target),
    expectedTargets,
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
  if (scenario === 'sibling') assert.equal(observed.events[0].prevented, false);
  if (scenario === 'descendant') {
    assert.deepEqual(
      observed.order,
      isRelease
        ? ['document-capture', 'navigate', 'anchor-click', 'document-bubble']
        : ['navigate', 'document-capture', 'anchor-click', 'document-bubble'],
    );
  }
  console.log(
    JSON.stringify({ browser: name, kind, scenario, ...observed, requests }),
  );
}

function expectedClickTargets(name, kind, scenario) {
  // Firefox still clicks when the target is removed during the press handler.
  const clicksAfterRemoval = name === 'firefox' && kind !== 'release';
  return {
    descendant: ['a'],
    ancestor: ['a'],
    sibling: ['root'],
    'remove-target': clicksAfterRemoval ? ['a'] : [],
    'replace-anchor': clicksAfterRemoval ? ['root'] : [],
    'change-href': ['pressed'],
    'stop-capture': ['pressed'],
    'copies-extensible': ['pressed'],
    'copies-nonextensible': ['pressed'],
  }[scenario];
}

// Release mode has no navigation callback during the press, so change the DOM before release.
function changePressedLink(page, scenario) {
  return page.evaluate((caseName) => {
    const anchor = document.querySelector('#a');
    if (caseName === 'remove-target')
      document.querySelector('#pressed').remove();
    if (caseName === 'replace-anchor')
      anchor.replaceWith(anchor.cloneNode(true));
    if (caseName === 'change-href') anchor.href = '/changed';
  }, scenario);
}

function expectedRoutes(kind, scenario) {
  if (kind !== 'release') return ['/first'];
  // Release away, or removing the pressed target, cancels activation.
  if (['sibling', 'replace-anchor', 'remove-target'].includes(scenario))
    return [];
  return [scenario === 'change-href' ? '/changed' : '/first'];
}

async function checkSvg(page, kind, scenario) {
  const requests = [];
  const graphic =
    '<svg width="200" height="80"><a href="/#native"><rect id="pressed" x="10" y="10" width="180" height="60" fill="blue" /></a></svg>';
  await routeFixture(
    page,
    requests,
    `<div id="root">${scenario === 'svg-html' ? `<a href="/first">${graphic}</a>` : graphic}</div>`,
  );
  await page.goto('http://fast-link.test/');
  await page.evaluate(async (controllerKind) => {
    const ownCore = await import('/core.js');
    const { bind } = await import('/binding.js');
    window.observed = { routes: [], clicks: [] };
    bind(ownCore, controllerKind, document.querySelector('#root'), ({ href }) =>
      window.observed.routes.push(href),
    );
    document.addEventListener('click', (event) =>
      window.observed.clicks.push({
        prevented: event.defaultPrevented,
        trusted: event.isTrusted,
      }),
    );
  }, kind);
  const pressed = page.locator('#pressed');
  const box = await pressed.boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  assert.deepEqual(
    await page.evaluate(() => window.observed.routes),
    scenario === 'svg-html' && kind !== 'release' ? ['/first'] : [],
  );
  assert.equal(page.url(), 'http://fast-link.test/');
  await page.mouse.up();
  if (scenario === 'svg-standalone')
    await page.waitForURL('http://fast-link.test/#native');
  await expect
    .poll(() => page.evaluate(() => window.observed.clicks.length))
    .toBe(1);
  assert.deepEqual(await page.evaluate(() => window.observed), {
    routes: scenario === 'svg-html' ? ['/first'] : [],
    clicks: [{ prevented: scenario === 'svg-html', trusted: true }],
  });
  assert.deepEqual(requests, []);
}

async function checkIframe(page) {
  const destinations = [];
  await page.route('http://fast-link.test/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/core.js')
      return route.fulfill({ contentType: 'text/javascript', body: core });
    let body;
    if (path === '/')
      body = '<iframe src="/frame" style="width:400px;height:200px"></iframe>';
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
}

/*
 * Uses two separately loaded core copies: the closest region owns an ordinary
 * link, and a native region leaves its click unprevented.
 */
async function checkRegions(page, scenario) {
  const requests = [];
  await routeFixture(
    page,
    requests,
    '<div id="root"><section id="inner"><a id="a" draggable="false" href="/first">Press</a></section></div><style>a{display:inline-block;padding:20px;user-select:none}</style>',
  );
  await page.goto('http://fast-link.test/');
  await page.evaluate(async (caseName) => {
    const outerCore = await import('/core.js');
    const innerCore = await import('/core.js?copy=2');
    window.observed = { routes: [], clicks: [] };
    const modes = {
      'native-inner-region': ['immediate', 'native'],
      'immediate-inner-region': ['native', 'immediate'],
      'switch-to-native': ['native', 'immediate'],
    }[caseName];
    for (const [copy, name, mode] of [
      [outerCore, 'root', modes[0]],
      [innerCore, 'inner', modes[1]],
    ]) {
      window[name] = copy.createLinkInteraction(
        document.querySelector(`#${name}`),
        mode === 'native'
          ? { mode }
          : {
              mode,
              navigate: ({ href }) =>
                window.observed.routes.push(`${name}:${href}`),
            },
      );
    }
    document.addEventListener('click', (event) => {
      window.observed.clicks.push({
        prevented: event.defaultPrevented,
        trusted: event.isTrusted,
      });
      // Keep the page after recording whether Fast Link left the click native.
      event.preventDefault();
    });
  }, scenario);
  const box = await page.locator('#a').boundingBox();
  assert.ok(box);
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  const isNative = scenario === 'native-inner-region';
  assert.deepEqual(
    await page.evaluate(() => window.observed.routes),
    isNative ? [] : ['inner:/first'],
  );
  if (scenario === 'switch-to-native') {
    await page.evaluate(() => window.inner.update({ mode: 'native' }));
  }
  await page.mouse.up();
  await expect
    .poll(() => page.evaluate(() => window.observed.clicks.length))
    .toBe(1);
  assert.deepEqual(await page.evaluate(() => window.observed), {
    routes: isNative ? [] : ['inner:/first'],
    clicks: [{ prevented: !isNative, trusted: true }],
  });
  assert.deepEqual(requests, []);
}

/* oxlint-disable no-await-in-loop -- Trusted presses and releases must run in order. */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { chromium, firefox, webkit } from 'playwright';

const core = await readFile(
  new URL('../packages/core/dist/index.js', import.meta.url),
  'utf8',
);
for (const [name, browserType] of Object.entries({
  chromium,
  firefox,
  webkit,
})) {
  const browser = await browserType.launch();
  try {
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
    ]) {
      const page = await browser.newPage();
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
        window.observed = { routes: [], events: [] };
        document.addEventListener('click', (event) => {
          window.observed.events.push({
            target: event.target.id,
            trusted: event.isTrusted,
            prevented: event.defaultPrevented,
          });
        });
        createFastLink(root, {
          navigate: ({ href }) => {
            window.observed.routes.push(href);
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
      await page.waitForTimeout(100);
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
        assert.equal(
          observed.events.length,
          1,
          `${name}/${scenario}: missing click`,
        );
        assert.equal(observed.events[0].prevented, true);
      }
      if (scenario === 'sibling')
        assert.equal(observed.events[0].prevented, false);
      assert.deepEqual(errors, []);
      console.log(
        JSON.stringify({ browser: name, scenario, ...observed, requests }),
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
}

/*
 * Shared environment, press, and request-counting helpers for the Next.js
 * fixture suites. Scenarios and their expectations stay in each suite.
 */

/** Origin of the production fixture server started by `next-setup.mjs`. */
export const fixtureOrigin = process.env.FAST_LINK_FIXTURE_ORIGIN;

/**
 * Whether the tested Next.js version supports router preparation. Only the
 * minimum-version packed consumer run sets `FAST_LINK_EXPECT_PREPARATION=false`.
 */
export const expectsPreparation =
  process.env.FAST_LINK_EXPECT_PREPARATION !== 'false';

/** Counts pointerdowns that reach the document. Call before opening a page. */
export async function installPressCounter(page) {
  await page.addInitScript(() => {
    window.__fixturePresses = 0;
    document.addEventListener('pointerdown', () => window.__fixturePresses++);
  });
}

/**
 * Presses the primary mouse button inside the link's first line box and keeps
 * it held. Resolves once the press reaches the document or the URL changes.
 * Requires `installPressCounter`.
 */
export async function pressAndHold(page, testId) {
  const target = page.getByTestId(testId);
  await target.scrollIntoViewIfNeeded();
  const box = await getPressBox(target);
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

/**
 * Returns the first line box of an element. An inline link that wraps has a
 * bounding box spanning both lines, whose center can fall on a neighboring link.
 */
export function getPressBox(target) {
  return target.evaluate((element) => {
    const rect = element.getClientRects()[0];
    return rect
      ? { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
      : null;
  });
}

/**
 * Counts requests for `pathname` as `route` and main-frame document requests as
 * `document` until `stop()`. Omit `pathname` to count only documents.
 */
export function countRequests(page, pathname) {
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

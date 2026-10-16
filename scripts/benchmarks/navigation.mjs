/** Checks committed content, event suppression, and a single history entry. */
function navigationCorrect(observed, early, historyBefore) {
  return (
    observed.text === 'Benchmark destination' &&
    observed.destination.text === observed.text &&
    observed.start > 0 &&
    observed.release >= observed.start &&
    observed.destination.committed >= observed.start &&
    observed.clicks === 1 &&
    observed.prevented === 1 &&
    observed.accepted === (early ? 1 : 0) &&
    observed.suppressed === (early ? 1 : 0) &&
    observed.history === historyBefore + 1
  );
}

/** Warms only the warm case and verifies pre-press route-request counts. */
async function prepareCache(page, cache, routeRequests) {
  if (cache === 'warm') {
    const prefetched = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/docs/benchmark/target' &&
        response.request().headers().rsc === '1' &&
        response.ok(),
    );
    await page.evaluate(() => window.benchmark.prefetch());
    await (await prefetched).finished();
  }
  await page.waitForLoadState('networkidle');
  const beforeRequests = routeRequests.length;
  if (
    (cache === 'cold' && beforeRequests !== 0) ||
    (cache === 'warm' && beforeRequests === 0)
  )
    throw new Error(`Unverified ${cache} cache state`);
  return beforeRequests;
}

/** Uses real input and reads the destination layout-effect marker after commit. */
async function pressAndObserve(page) {
  const anchor = page.locator('[data-benchmark-area] a');
  const box = await anchor.boundingBox();
  if (!box) throw new Error('Missing navigation anchor');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(80);
  await page.mouse.up();
  await page.locator('[data-benchmark-destination]').waitFor();
  await page.waitForFunction(() => Boolean(window.benchmarkDestination));
  await page.waitForLoadState('networkidle');
  const observed = await page.evaluate(() => ({
    ...window.benchmark.events,
    destination: window.benchmarkDestination,
    history: history.length,
    text: document.querySelector('[data-benchmark-destination]')?.textContent,
  }));
  return observed;
}

/** Rejects a navigation whose network activity contradicts its requested cache state. */
function verifyCacheUse(cache, beforeRequests, requestCount) {
  if (
    (cache === 'cold' && requestCount === beforeRequests) ||
    (cache === 'warm' && requestCount !== beforeRequests)
  )
    throw new Error(`Navigation did not use verified ${cache} router cache`);
}

/** Measures one real mouse navigation in a fresh context with a verified router cache. */
export async function measureNavigation(openPage, variant, cache, batch) {
  const { context, page } = await openPage();
  try {
    const routeRequests = [];
    page.on('request', (request) => {
      if (
        new URL(request.url()).pathname === '/docs/benchmark/target' &&
        request.headers().rsc === '1'
      )
        routeRequests.push(request);
    });
    await page.evaluate((v) => window.benchmark.navigation(v), variant);
    const beforeRequests = await prepareCache(page, cache, routeRequests);
    const historyBefore = await page.evaluate(() => history.length);
    const observed = await pressAndObserve(page);
    const early = variant !== 'next';
    const correct = navigationCorrect(observed, early, historyBefore);

    verifyCacheUse(cache, beforeRequests, routeRequests.length);

    return {
      metrics: {
        navigation: {
          value: observed.destination.committed - observed.start,
          unit: 'ms',
          correct,
        },
        pressDuration: {
          value: observed.release - observed.start,
          unit: 'ms',
          correct,
        },
      },
      check: {
        variant,
        cache,
        batch,
        beforeRequests,
        navigationRequests: routeRequests.length - beforeRequests,
        ...observed,
      },
    };
  } finally {
    await context.close();
  }
}

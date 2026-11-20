/* oxlint-disable no-await-in-loop -- Measure variants sequentially without contention. */
import { measureNavigation } from './navigation.mjs';
import { networkVariants } from './report.mjs';

/**
 * Executes the report's recorded workload in one browser. With a positive
 * recorded RTT, `origin` is the delay `proxy`'s and only network navigations run.
 * The caller owns the browser, fixture, and proxy lifetime; each batch closes
 * its contexts.
 */
export function createMeasurements(browser, origin, result, proxy) {
  const { conditions } = result;
  const { rttMs } = result.environment;
  const selected = conditions.case;
  const { modes } = conditions;

  /** Retains a sample only when its timed work passed correctness checks. */
  function saveMetric(name, metric, batch) {
    if (
      !Number.isFinite(metric.value) ||
      (metric.value < 0 && metric.signed !== true) ||
      metric.correct !== true
    )
      throw new Error(`Invalid measured work: ${name}`);
    const entry = (result.metrics[name] ??= {
      unit: metric.unit,
      ...(metric.signed && { signed: true }),
      samples: [],
      checks: [],
      batches: [],
    });
    entry.samples.push(metric.value);
    entry.checks.push(metric.correct);
    entry.batches.push(batch);
  }

  /** Opens an isolated page and records uncaught browser errors in the run report. */
  async function openPage() {
    // Load and hydrate without delay; only the measured navigation is delayed.
    proxy?.setRtt(0);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => result.errors.push(error.message));
    await page.goto(`${origin}/docs/benchmark`);
    await page.waitForFunction(() => Boolean(window.benchmark));
    return { context, page };
  }

  /** Records the fixture's API and rejects modes it cannot select. */
  async function recordFixture(page) {
    const fixture = await page.evaluate(() => ({
      api: window.benchmark.api,
      modes: [...window.benchmark.modes],
      preparation: window.benchmark.preparation,
    }));
    const unsupported = modes.filter((mode) => !fixture.modes.includes(mode));
    if (unsupported.length)
      throw new Error(
        `Fixture ${fixture.api} does not support: ${unsupported.join(', ')}`,
      );
    result.fixture ??= fixture;
  }

  /** Saves all named measurements returned by a browser-side workload. */
  function saveMetrics(prefix, metrics, batch) {
    for (const [name, metric] of Object.entries(metrics)) {
      saveMetric(`${prefix}.${name}`, metric, batch);
    }
  }

  /** Measures event dispatch in the browser; event creation and warmup stay outside timing. */
  async function measureInteraction(page, group, variant, mode, batch) {
    const metrics = await page.evaluate(
      (input) =>
        input.group === 'core'
          ? window.benchmark.micro(input.variant, input.mode, input.workload)
          : window.benchmark.interaction(
              input.variant,
              input.mode,
              input.workload,
            ),
      { group, variant, mode, workload: conditions },
    );
    saveMetrics(scenarioPrefix(group, variant, mode), metrics, batch);
  }

  /** Warms the identical list workload once before measuring its synchronous commits. */
  async function measureLifecycle(page, group, variant, mode, count, batch) {
    const input = { variant, mode, count };
    const run = () =>
      page.evaluate(
        (value) =>
          window.benchmark.lifecycle(value.variant, value.mode, value.count),
        input,
      );
    await run();
    saveMetrics(
      `${scenarioPrefix(group, variant, mode)}.${count}`,
      await run(),
      batch,
    );
  }

  /** Warms once, then times each mode change at every list size. */
  async function measureModeSwitches(page, batch) {
    if (modes.length < 2) return;
    const variants = batch % 2 ? ['region', 'fast'] : ['fast', 'region'];
    for (const variant of variants)
      for (const count of conditions.listSizes) {
        const input = { variant, modes, count };
        const run = () =>
          page.evaluate(
            (value) =>
              window.benchmark.modeSwitch(
                value.variant,
                value.modes,
                value.count,
              ),
            input,
          );
        await run();
        saveMetrics(`next.${variant}.switch.${count}`, await run(), batch);
      }
  }

  /** Runs one case's variants in alternating order, without overlapping measurements. */
  async function measureGroup(page, group, batch) {
    const variants = groupVariants(group, modes);
    if (batch % 2) variants.reverse();

    for (const [variant, mode] of variants) {
      if (group !== 'next')
        await measureInteraction(page, group, variant, mode, batch);
      if (group === 'core') continue;

      const counts = group === 'next' ? conditions.listSizes : [1];
      for (const count of counts) {
        await measureLifecycle(page, group, variant, mode, count, batch);
      }
    }
    if (group === 'next') await measureModeSwitches(page, batch);
  }

  /**
   * Runs every navigation variant for each cache state and hold, alternating
   * variant order so matched scenarios run close together. Repeats the whole
   * round rather than one scenario so drift reaches every scenario alike.
   */
  async function measureNavigations(batch) {
    const variants = groupVariants('next', modes);
    if (batch % 2) variants.reverse();
    for (let sample = 0; sample < conditions.navigationSamples; sample++)
      for (const cache of conditions.caches)
        for (const holdMs of conditions.holdsMs)
          for (const [variant, mode] of variants) {
            const { metrics, check } = await measureNavigation(openPage, {
              variant,
              mode,
              cache,
              holdMs,
              batch,
              sample,
            });
            const scenario = `${scenarioPrefix('next', variant, mode)}.${cache}.hold${holdMs}`;
            saveMetrics(scenario, metrics, batch);
            result.navigationChecks ??= [];
            result.navigationChecks.push({ scenario, ...check });
          }
  }

  /** Opens a hydrated page, then delays its traffic by the recorded RTT. */
  async function openDelayedPage() {
    const opened = await openPage();
    proxy.setRtt(rttMs);
    return opened;
  }

  /**
   * Runs the network navigation matrix with the same round-robin and
   * alternating variant order as localhost navigation.
   */
  async function measureNetworkNavigations(batch) {
    const { network } = conditions;
    const variants = networkVariants(network, modes);
    if (batch % 2) variants.reverse();
    for (let sample = 0; sample < conditions.navigationSamples; sample++)
      for (const destination of network.destinations)
        for (const cache of network.caches)
          for (const holdMs of network.holdsMs)
            for (const [variant, mode] of variants) {
              const { metrics, check } = await measureNavigation(
                openDelayedPage,
                {
                  variant,
                  mode,
                  cache,
                  holdMs,
                  destination,
                  settleNetwork: true,
                  batch,
                  sample,
                },
              );
              const scenario = `${scenarioPrefix('next', variant, mode)}.rtt${rttMs}.${destination}.${cache}.hold${holdMs}`;
              saveMetrics(scenario, metrics, batch);
              result.navigationChecks ??= [];
              result.navigationChecks.push({ scenario, ...check });
            }
  }

  /** Shares a page for dispatch and lifecycle work; navigation gets fresh contexts. */
  async function measureBatch(batch) {
    const { context, page } = await openPage();
    try {
      await recordFixture(page);
      const groups =
        selected === 'all' ? ['core', 'react', 'next'] : [selected];
      // A delayed run measures only network navigation.
      if (rttMs === 0)
        for (const group of groups) await measureGroup(page, group, batch);
    } finally {
      await context.close();
    }

    if (rttMs > 0) await measureNetworkNavigations(batch);
    else if (selected === 'all' || selected === 'next')
      await measureNavigations(batch);
  }

  return { measureBatch };
}

/** Lists [variant, mode] pairs; baselines without Fast Link have no mode. */
function groupVariants(group, modes) {
  const baseline = { core: 'bare', react: 'plain', next: 'next' }[group];
  const managed = {
    core: ['core'],
    react: ['react'],
    next: ['fast', 'region'],
  }[group];
  return [
    [baseline, null],
    ...managed.flatMap((variant) => modes.map((mode) => [variant, mode])),
  ];
}

function scenarioPrefix(group, variant, mode) {
  return mode ? `${group}.${variant}.${mode}` : `${group}.${variant}`;
}

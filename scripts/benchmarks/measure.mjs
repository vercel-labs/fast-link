/* oxlint-disable no-await-in-loop -- Measure variants sequentially without contention. */
import { measureNavigation } from './navigation.mjs';

/**
 * Binds scenario execution to one browser and report.
 * The caller owns the browser and fixture lifetime; each batch closes its contexts.
 */
export function createMeasurements(browser, origin, result, selected) {
  /** Retains a sample only when its timed work passed correctness checks. */
  function saveMetric(name, metric, batch) {
    if (
      !Number.isFinite(metric.value) ||
      metric.value < 0 ||
      metric.correct !== true
    )
      throw new Error(`Invalid measured work: ${name}`);
    const entry = (result.metrics[name] ??= {
      unit: metric.unit,
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
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
    });
    const page = await context.newPage();
    page.on('pageerror', (error) => result.errors.push(error.message));
    await page.goto(`${origin}/docs/benchmark`);
    await page.waitForFunction(() => Boolean(window.benchmark));
    return { context, page };
  }

  /** Saves all named measurements returned by a browser-side workload. */
  function saveMetrics(prefix, metrics, batch) {
    for (const [name, metric] of Object.entries(metrics)) {
      saveMetric(`${prefix}.${name}`, metric, batch);
    }
  }

  /** Measures event dispatch in the browser; event creation and warmup stay outside timing. */
  async function measureInteraction(page, group, variant, batch) {
    const metrics = await page.evaluate(
      (input) =>
        input.group === 'core'
          ? window.benchmark.micro(input.variant)
          : window.benchmark.interaction(input.variant),
      { group, variant },
    );
    saveMetrics(`${group}.${variant}`, metrics, batch);
  }

  /** Warms the identical list workload once before measuring its synchronous commits. */
  async function measureLifecycle(page, group, variant, count, batch) {
    const input = { variant, count };
    await page.evaluate(
      (value) => window.benchmark.lifecycle(value.variant, value.count),
      input,
    );
    const metrics = await page.evaluate(
      (value) => window.benchmark.lifecycle(value.variant, value.count),
      input,
    );
    saveMetrics(`${group}.${variant}.${count}`, metrics, batch);
  }

  /** Runs one case's variants in alternating order, without overlapping measurements. */
  async function measureGroup(page, group, batch) {
    const variants = {
      core: ['bare', 'core'],
      react: ['plain', 'react'],
      next: ['next', 'fast', 'region'],
    }[group];
    if (batch % 2) variants.reverse();

    for (const variant of variants) {
      if (group !== 'next')
        await measureInteraction(page, group, variant, batch);
      if (group === 'core') continue;

      const counts = group === 'next' ? [1, 100, 1000] : [1];
      for (const count of counts) {
        await measureLifecycle(page, group, variant, count, batch);
      }
    }
  }

  /** Runs warm and cold navigation separately, keeping their evidence with the samples. */
  async function measureNavigations(batch) {
    const variants =
      batch % 2 ? ['region', 'fast', 'next'] : ['next', 'fast', 'region'];
    for (const variant of variants) {
      for (const cache of ['warm', 'cold']) {
        const { metrics, check } = await measureNavigation(
          openPage,
          variant,
          cache,
          batch,
          result.conditions.holdMs,
        );
        saveMetrics(`next.${variant}.${cache}`, metrics, batch);
        result.navigationChecks ??= [];
        result.navigationChecks.push(check);
      }
    }
  }

  /** Shares a page for dispatch and lifecycle work; navigation gets fresh contexts. */
  async function measureBatch(batch) {
    const { context, page } = await openPage();
    try {
      const groups =
        selected === 'all' ? ['core', 'react', 'next'] : [selected];
      for (const group of groups) await measureGroup(page, group, batch);
    } finally {
      await context.close();
    }

    if (selected === 'all' || selected === 'next')
      await measureNavigations(batch);
  }

  return { measureBatch };
}

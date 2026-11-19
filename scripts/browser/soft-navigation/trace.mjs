import { readFile } from 'node:fs/promises';

// Categories carrying Chrome's soft-navigation decisions, input dispatch and
// same-document URL commits.
const CATEGORIES = [
  'loading',
  'disabled-by-default-loading',
  'blink',
  'devtools.timeline',
  'navigation',
];

const SUMMARY_EVENTS =
  /^(SoftNavigation|FrameLoader::updateForSameDocumentNavigation$|EventDispatch$)/;

/**
 * Records a Chrome trace of the whole browser while `use` runs, then returns
 * its result with the soft-navigation events, in milliseconds after the
 * trusted pointerdown.
 */
export async function withTrace(browser, path, use) {
  await browser.startTracing(undefined, { path, categories: CATEGORIES });
  let result;
  try {
    result = await use();
  } finally {
    await browser.stopTracing();
  }
  return { result, trace: { path, events: await summarizeTrace(path) } };
}

async function summarizeTrace(path) {
  const { traceEvents } = JSON.parse(await readFile(path, 'utf8'));
  const events = traceEvents
    .filter((event) => event.ts && SUMMARY_EVENTS.test(event.name))
    .filter(
      (event) =>
        event.name !== 'EventDispatch' ||
        ['pointerdown', 'pointerup', 'click'].includes(event.args?.data?.type),
    )
    .toSorted((a, b) => a.ts - b.ts);
  const press = events.find(
    (event) =>
      event.name === 'EventDispatch' && event.args.data.type === 'pointerdown',
  );
  return events
    .filter((event) => !press || event.ts >= press.ts)
    .map((event) => {
      const data = event.args?.data ?? {};
      return {
        name: event.name,
        time: press ? Math.round((event.ts - press.ts) / 100) / 10 : null,
        type: data.type,
        url: data.url ?? (data.context?.URL || undefined),
        contextId: data.context?.softNavContextId,
      };
    });
}

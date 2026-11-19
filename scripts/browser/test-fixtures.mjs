import { expect, test as base } from '@playwright/test';

export { expect };

// Every case fails on uncaught page errors. A case can expect messages, such as
// a throwing guard, or allow known `{ browser, pattern }` reports, which are
// logged as observations.
export const test = base.extend({
  expectedPageErrors: [[], { option: true }],
  allowedPageErrors: [[], { option: true }],
  pageErrors: [
    async ({ page, expectedPageErrors, allowedPageErrors }, use, testInfo) => {
      const errors = [];
      const onError = (error) => errors.push(error);
      page.on('pageerror', onError);
      try {
        await use(errors);
      } finally {
        page.off('pageerror', onError);
        if (errors.length || testInfo.status !== testInfo.expectedStatus) {
          await testInfo.attach('page-errors', {
            body: JSON.stringify(
              errors.map((error) => error.stack ?? error.message),
              null,
              2,
            ),
            contentType: 'application/json',
          });
        }
        const messages = errors.map((error) => error.message);
        const isAllowed = (message) =>
          allowedPageErrors.some(
            ({ browser, pattern }) =>
              browser === testInfo.project.name && pattern.test(message),
          );
        if (allowedPageErrors.length)
          logObservation({ allowedPageErrors: messages.filter(isAllowed) });
        expect(
          messages.filter((message) => !isAllowed(message)),
          'unexpected browser errors',
        ).toEqual(expectedPageErrors);
      }
    },
    { auto: true },
  ],
});

/** Logs browser behavior recorded as evidence rather than asserted. */
export function logObservation(observation) {
  const { title, project } = test.info();
  console.log(
    `[observation] ${project.name} | ${title} | ${JSON.stringify(observation)}`,
  );
}

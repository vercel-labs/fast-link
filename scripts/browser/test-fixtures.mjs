import { expect, test as base } from '@playwright/test';

export { expect };

export const test = base.extend({
  pageErrors: [
    async ({ page }, use, testInfo) => {
      const errors = [];
      const onError = (error) => errors.push(error.stack ?? error.message);
      page.on('pageerror', onError);
      try {
        await use(errors);
      } finally {
        page.off('pageerror', onError);
        if (errors.length || testInfo.status !== testInfo.expectedStatus) {
          await testInfo.attach('page-errors', {
            body: JSON.stringify(errors, null, 2),
            contentType: 'application/json',
          });
        }
        expect(errors, 'unexpected browser errors').toEqual([]);
      }
    },
    { auto: true },
  ],
});

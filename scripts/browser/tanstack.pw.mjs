import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/app/');
  await expect(page.getByRole('heading', { name: 'Home page' })).toBeVisible();
});

test('navigates before mouse release and creates one history entry', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'Fast post', exact: true }).hover();
  await page.mouse.down();
  await expect(page.getByRole('heading', { name: 'Post page' })).toBeVisible();
  await expect(page).toHaveURL('/app/posts/42?q=hello+world');
  await page.mouse.up();
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Home page' })).toBeVisible();
});

test('preserves native release timing and keyboard activation', async ({
  page,
}) => {
  const link = page.getByRole('link', { name: 'Native post', exact: true });
  await link.hover();
  await page.mouse.down();
  // The awaited pointerdown completed; early navigation would already change the URL.
  expect(new URL(page.url()).pathname).toBe('/app/');
  await page.mouse.up();
  await expect(page).toHaveURL('/app/posts/native?q=');
  await page.getByRole('link', { name: 'Home', exact: true }).click();
  await page.getByRole('link', { name: 'Fast post', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Post page' })).toBeVisible();
});

test('preserves replace and route masking under a base path', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'Fast post', exact: true }).click();
  await expect(page).toHaveURL('/app/posts/42?q=hello+world');
  await page.getByRole('link', { name: 'Replace post', exact: true }).click();
  await expect(page).toHaveURL('/app/posts/replace?q=');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Home page' })).toBeVisible();
  await page.getByRole('link', { name: 'Masked post', exact: true }).click();
  await expect(page).toHaveURL('/app/preview');
  await expect(page.getByLabel('Current route')).toHaveText('/posts/masked?q=');
});

test('routes ordinary region anchors through the base path', async ({
  page,
}) => {
  await page.getByRole('link', { name: 'Region post', exact: true }).hover();
  await page.mouse.down();
  await expect(page.getByRole('heading', { name: 'Post page' })).toBeVisible();
  await expect(page).toHaveURL('/app/posts/region?q=region');
  await page.mouse.up();
});

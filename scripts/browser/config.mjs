import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

/** Configures an isolated artifact directory and the shared browser matrix. */
export function browserConfig(suite) {
  // Workers reload this module; inherit the runner's artifact identity.
  const invocation = (process.env.__FAST_LINK_BROWSER_RUN_ID ??= randomUUID());
  return defineConfig({
    testDir: fileURLToPath(new URL('./', import.meta.url)),
    testMatch: `${suite}.pw.mjs`,
    fullyParallel: true,
    workers: 6,
    retries: 0,
    timeout: suite === 'core' ? 15000 : 30000,
    expect: { timeout: 5000 },
    outputDir: fileURLToPath(
      new URL(`../../test-results/${suite}-${invocation}`, import.meta.url),
    ),
    reporter: 'list',
    use: {
      actionTimeout: 5000,
      navigationTimeout: 10000,
      screenshot: 'only-on-failure',
      trace: 'retain-on-failure',
    },
    projects: ['chromium', 'firefox', 'webkit'].map((browserName) => ({
      name: browserName,
      use: { browserName },
    })),
  });
}

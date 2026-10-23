import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { startFixture } from './fixture-server.mjs';

/** Starts one verified production fixture and returns its invocation teardown. */
export default async function setup() {
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const fixture = resolve(
    process.env.FAST_LINK_FIXTURE_DIR ?? resolve(root, 'fixtures/next-16'),
  );
  const require = createRequire(resolve(fixture, 'package.json'));
  const versions = require('./package.json').dependencies;
  for (const name of ['next', 'react', 'react-dom']) {
    assert.equal(
      require(`${name}/package.json`).version,
      versions[name],
      `${name} fixture version`,
    );
  }
  assert.equal(versions.react, versions['react-dom'], 'matching React DOM');
  console.log(
    `Next fixture: Next ${versions.next}, React/DOM ${versions.react}`,
  );
  const server = await startFixture(root, '/docs', fixture);
  await server.waitUntilReady();
  process.env.FAST_LINK_FIXTURE_ORIGIN = server.origin;
  console.log(`Next fixture origin: ${server.origin}`);
  return () => server.close();
}

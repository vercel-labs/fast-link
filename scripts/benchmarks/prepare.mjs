/* oxlint-disable no-await-in-loop -- Build revisions sequentially without contention. */
import { cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseDocument } from 'yaml';

import { runCommand } from './process.mjs';

/** Adds workspace imports needed to run today's fixture on older revisions. */
async function addFixtureDependencies(directory) {
  const fixturePath = resolve(directory, 'fixtures/next-16/package.json');
  const manifest = JSON.parse(await readFile(fixturePath, 'utf8'));

  if (
    manifest.dependencies['@fast-link/core'] &&
    manifest.dependencies['@fast-link/react']
  ) {
    return;
  }

  manifest.dependencies['@fast-link/core'] = 'workspace:^';
  manifest.dependencies['@fast-link/react'] = 'workspace:^';
  await writeFile(fixturePath, `${JSON.stringify(manifest, null, 2)}\n`);

  const lockPath = resolve(directory, 'pnpm-lock.yaml');
  const lock = parseDocument(await readFile(lockPath, 'utf8'));
  if (lock.get('lockfileVersion') !== '9.0') {
    throw new Error('Unsupported baseline lockfile format');
  }

  for (const name of ['core', 'react']) {
    lock.setIn(
      ['importers', 'fixtures/next-16', 'dependencies', `@fast-link/${name}`],
      { specifier: 'workspace:^', version: `link:../../packages/${name}` },
    );
  }

  await writeFile(lockPath, lock.toString());
}

/**
 * Copies the head workload into the disposable base checkout, then builds both.
 * Keeps each revision's package source and external dependency versions intact.
 */
export async function prepareCheckouts(base, head) {
  if (base !== head) {
    await cp(
      resolve(head, 'fixtures/next-16/app/benchmark'),
      resolve(base, 'fixtures/next-16/app/benchmark'),
      { recursive: true, force: true },
    );
  }

  for (const directory of new Set([base, head])) {
    await addFixtureDependencies(directory);
    await runCommand('pnpm', ['install', '--frozen-lockfile'], directory);
    await runCommand(
      'pnpm',
      ['exec', 'turbo', 'run', 'build', '--force'],
      directory,
    );
  }
}

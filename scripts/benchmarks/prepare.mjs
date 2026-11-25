/* oxlint-disable no-await-in-loop -- Build revisions sequentially without contention. */
import { copyFile, cp, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { parseDocument } from 'yaml';

import { runCommand } from './process.mjs';

// Checked in order: current revisions also export older names.
const FIXTURE_BINDINGS = [
  { coreExport: 'createLinkInteraction', file: null },
  { coreExport: 'createClickPreparation', file: 'click-preparation.tsx' },
  { coreExport: 'createFastLink', file: 'fast-link.tsx' },
];

/**
 * Chooses benchmark bindings for a revision from its public core exports.
 * Returns the replacement file under scripts/benchmarks/bindings, or `null`
 * when the head bindings already match.
 */
export function selectFixtureBindings(coreIndexSource) {
  const match = FIXTURE_BINDINGS.find(({ coreExport }) =>
    new RegExp(`\\b${coreExport}\\b`).test(coreIndexSource),
  );
  if (!match) throw new Error('Unsupported baseline public API');
  return match.file;
}

/** Replaces the copied head bindings with ones compatible with the base API. */
async function installFixtureBindings(directory) {
  const file = selectFixtureBindings(
    await readFile(resolve(directory, 'packages/core/src/index.ts'), 'utf8'),
  );
  if (!file) return;
  await copyFile(
    resolve(import.meta.dirname, 'bindings', file),
    resolve(directory, 'fixtures/next-16/app/benchmark/bindings.tsx'),
  );
}

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
 * Copies the head workload and compatible API bindings into the disposable
 * base checkout, then builds both.
 * Keeps each revision's package source and external dependency versions intact.
 */
export async function prepareCheckouts(base, head) {
  if (base !== head) {
    await cp(
      resolve(head, 'fixtures/next-16/app/benchmark'),
      resolve(base, 'fixtures/next-16/app/benchmark'),
      { recursive: true, force: true },
    );
    await installFixtureBindings(base);
  }

  for (const directory of new Set([base, head])) {
    await addFixtureDependencies(directory);
    await runCommand('pnpm', ['install', '--frozen-lockfile'], directory);
    await runCommand(
      'pnpm',
      [
        'exec',
        'turbo',
        'run',
        'build',
        '--filter=@fast-link/fixture-next-16...',
        '--force',
      ],
      directory,
    );
  }
}

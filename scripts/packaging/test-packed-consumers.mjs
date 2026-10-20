/*
 * Installs archives from pnpm pack in a temporary app, then checks package
 * metadata, core/React imports without a browser, and a Next.js production build
 * and TypeScript check.
 * This catches missing files and dependency problems that workspace links can hide.
 */

/* oxlint-disable no-await-in-loop -- Consumer checks run in dependency order. */

import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyReleaseArtifacts } from './release-artifacts.mjs';

const [archiveDirectory, commit] = process.argv.slice(2);
if (!archiveDirectory) {
  throw new Error(
    'Usage: test-packed-consumers.mjs <directory> <full-commit-sha>',
  );
}
const artifacts = verifyReleaseArtifacts({
  archiveDirectory,
  commit,
  root: process.cwd(),
  execute: (command, args) => execFileSync(command, args, { encoding: 'utf8' }),
});
const fixture = fileURLToPath(
  new URL('../../fixtures/next-16/', import.meta.url),
);
const fixtureManifest = JSON.parse(
  await readFile(join(fixture, 'package.json'), 'utf8'),
);
const consumer = await mkdtemp(join(tmpdir(), 'fast-link-consumer-'));
const run = (command, args) =>
  execFileSync(command, args, {
    cwd: consumer,
    stdio: 'inherit',
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
  });

try {
  const dependencies = { ...fixtureManifest.dependencies };
  for (const { manifest, archive } of artifacts) {
    dependencies[manifest.name] = `file:${archive}`;
  }
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      dependencies,
      devDependencies: fixtureManifest.devDependencies,
    }),
  );
  run('npm', [
    'install',
    '--engine-strict',
    '--registry=https://registry.npmjs.org',
    '--no-audit',
    '--no-fund',
  ]);
  run(process.execPath, [
    '--input-type=module',
    '-e',
    `
    import '@fast-link/core';
    import '@fast-link/react';
    console.log('Core and React imports passed without a browser DOM');
  `,
  ]);
  for (const path of ['app', 'next.config.ts', 'tsconfig.json']) {
    await cp(join(fixture, path), join(consumer, path), { recursive: true });
  }
  run(process.execPath, ['node_modules/next/dist/bin/next', 'build']);
  run(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit']);
  console.log(`Packed consumers passed on ${process.version}`);
} finally {
  await rm(consumer, { recursive: true, force: true });
}

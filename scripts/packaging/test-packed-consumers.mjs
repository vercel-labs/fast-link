/*
 * Installs archives from pnpm pack in a temporary app, then checks package
 * metadata, core/React imports without a browser, and a Next.js production build
 * and TypeScript check.
 * This catches missing files and dependency problems that workspace links can hide.
 */

/* oxlint-disable no-await-in-loop -- Consumer checks run in dependency order. */

import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { verifyReleaseArtifacts } from './release-artifacts.mjs';

const [archiveDirectory, commit, mode] = process.argv.slice(2);
if (mode !== undefined && mode !== '--minimum')
  throw new Error('Unknown consumer mode');
const minimum = mode === '--minimum';
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
const root = fileURLToPath(new URL('../../', import.meta.url));
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
  const devDependencies = { ...fixtureManifest.devDependencies };
  if (minimum) {
    Object.assign(dependencies, {
      next: '16.0.0',
      react: '19.0.0',
      'react-dom': '19.0.0',
    });
    const reactManifest = JSON.parse(
      await readFile(join(root, 'packages/react/package.json'), 'utf8'),
    );
    for (const name of ['@testing-library/react', 'jsdom', 'vitest']) {
      devDependencies[name] = reactManifest.devDependencies[name];
    }
    Object.assign(devDependencies, {
      '@types/react': '19.0.0',
      '@types/react-dom': '19.0.0',
    });
  }
  for (const { manifest, archive } of artifacts) {
    dependencies[manifest.name] = `file:${archive}`;
  }
  await writeFile(
    join(consumer, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      dependencies,
      devDependencies,
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
    import assert from 'node:assert/strict';
    import { createRequire } from 'node:module';
    const require = createRequire(process.cwd() + '/package.json');
    const expected = require('./package.json').dependencies;
    for (const name of ['next', 'react', 'react-dom']) {
      assert.equal(require(name + '/package.json').version, expected[name], name);
    }
    assert.equal(require('react').version, expected.react);
    assert.equal(require('react-dom').version, expected.react);
    assert.equal(expected.react, expected['react-dom']);
    console.log('Resolved Next ' + expected.next + ', React/DOM ' + expected.react);
  `,
  ]);
  if (minimum) {
    // Reuse the lifecycle suite through the installed public React export.
    const tests = await readFile(
      join(root, 'packages/react/src/use-fast-link/index.test.tsx'),
      'utf8',
    );
    await mkdir(join(consumer, 'src/use-fast-link'), { recursive: true });
    await writeFile(
      join(consumer, 'src/use-fast-link/index.test.tsx'),
      tests.replace("from './index'", "from '@fast-link/react'"),
    );
    const config = await readFile(
      join(root, 'packages/react/vitest.config.ts'),
      'utf8',
    );
    await writeFile(
      join(consumer, 'vitest.config.ts'),
      config.replace('../../vitest.shared.ts', './vitest.shared.ts'),
    );
    await cp(
      join(root, 'vitest.shared.ts'),
      join(consumer, 'vitest.shared.ts'),
    );
    await cp(join(root, 'tsconfig.base.json'), join(consumer, 'tsconfig.json'));
    run(process.execPath, [
      'node_modules/vitest/vitest.mjs',
      'run',
      '--project=unit',
    ]);
    await rm(join(consumer, 'src'), { recursive: true });
    await rm(join(consumer, 'vitest.config.ts'));
    await rm(join(consumer, 'vitest.shared.ts'));
  }
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
  if (minimum) {
    run(process.execPath, [
      join(root, 'scripts/browser/test-next-fixtures.mjs'),
      consumer,
      'chromium',
    ]);
  }
  console.log(
    `Packed ${minimum ? 'minimum' : 'pinned'} consumers passed on ${process.version}`,
  );
} finally {
  await rm(consumer, { recursive: true, force: true });
}

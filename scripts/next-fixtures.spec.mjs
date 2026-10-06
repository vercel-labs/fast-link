import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { syncNextFixtures } from './generate-next-fixtures.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

it('generates version-local fixtures from shared sources', () => {
  const root = createFixtureRoot();

  syncNextFixtures({ root });

  const next15 = readOutput(root, 'next-15', 'client-links.tsx');
  const next16 = readOutput(root, 'next-16', 'client-links.tsx');
  expect(next15).toContain(
    '// Generated from fixtures/next-shared/app/client-links.tsx.',
  );
  expect(next15).toContain(
    '// Run `pnpm fixtures:generate` after editing the source.',
  );
  expect(next15).not.toContain('transitionTypes');
  expect(next16).toContain("transitionTypes={['slide']}");
  expect(readOutput(root, 'next-15', 'policy-links.tsx')).toBe(
    readOutput(root, 'next-16', 'policy-links.tsx'),
  );
});

it('reports stale outputs without rewriting them', () => {
  const root = createFixtureRoot();
  syncNextFixtures({ root });
  const outputPath = join(
    root,
    'fixtures',
    'next-15',
    'app',
    'client-links.tsx',
  );
  writeFileSync(outputPath, 'stale\n');

  expect(() => syncNextFixtures({ root, mode: 'check' }))
    .toThrow(`Generated Next fixtures are stale:
- fixtures/next-15/app/client-links.tsx
Run \`pnpm fixtures:generate\` to update them.`);
  expect(readFileSync(outputPath, 'utf8')).toBe('stale\n');
});

function createFixtureRoot() {
  const root = mkdtempSync(join(tmpdir(), 'fast-link-next-fixtures-'));
  roots.push(root);
  const sourceRoot = join(root, 'fixtures', 'next-shared', 'app');
  mkdirSync(sourceRoot, { recursive: true });
  writeFileSync(
    join(sourceRoot, 'client-links.tsx'),
    `const link = (
  <FastLink
    href="/fast"
    ${'/* @next-16-only:start */'}
    transitionTypes={['slide']}
    ${'/* @next-16-only:end */'}
  />
);
`,
  );
  writeFileSync(
    join(sourceRoot, 'policy-links.tsx'),
    'export const policy = 1;\n',
  );
  return root;
}

function readOutput(root, version, sourceName) {
  return readFileSync(
    join(root, 'fixtures', version, 'app', sourceName),
    'utf8',
  );
}
